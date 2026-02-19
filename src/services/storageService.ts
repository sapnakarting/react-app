
/**
 * CLOUDFLARE R2 STORAGE SERVICE
 * Note: Browser-based uploads to R2 require a Cloudflare Worker as a proxy 
 * to protect your API keys.
 */

import { supabase } from './supabaseClient';

// Internal helper to access environment variables safely
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {}
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return '';
};

// Expose the current mode for UI verification
export const getStorageMode = () => {
  const workerUrl = getEnv('VITE_CLOUDFLARE_WORKER_URL');
  return workerUrl ? 'CLOUDFLARE R2' : 'SUPABASE STORAGE (Fallback)';
};

// Internal helper to resize images on the client side
const resizeImage = (base64Str: string, maxWidth = 1200): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('Canvas context failed');
      
      ctx.drawImage(img, 0, 0, width, height);
      // Export as medium-quality JPEG (0.7) to drastically reduce size
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
  });
};

export const storageService = {
  /**
   * Uploads a file to Cloudflare R2 via a Worker Proxy.
   * 1. Resizes image to save bandwidth/costs.
   * 2. Sends to the Cloudflare Worker URL defined in .env.
   */
  async uploadFile(bucket: string, path: string, fileData: string): Promise<string | null> {
    try {
      if (!fileData) throw new Error("No file data.");

      // Robust Mime Detection avoiding Regex on full string (prevents stack overflow on large PDFs)
      let contentType = 'application/octet-stream';
      let dataToUpload = fileData;
      
      if (fileData.startsWith('data:')) {
         const commaIndex = fileData.indexOf(',');
         if (commaIndex !== -1) {
             const meta = fileData.substring(0, commaIndex);
             const match = meta.match(/data:([^;]+)/);
             if (match) contentType = match[1];
         }
      }

      console.log(`[Storage] Uploading to ${bucket}: ${path} (Detected: ${contentType})`);

      // ONLY resize if it is an image
      if (contentType.startsWith('image/')) {
         try {
           console.log('[Storage] Resizing image...');
           dataToUpload = await resizeImage(fileData);
           contentType = 'image/jpeg'; // Resizer always returns JPEG
           console.log('[Storage] Image resized successfully.');
         } catch (err) {
           console.warn("Image resize failed, using original data.", err);
         }
      } else {
         console.log('[Storage] Skipping resize (not an image).');
      }
      
      const workerUrl = getEnv('VITE_CLOUDFLARE_WORKER_URL');
      if (!workerUrl) {
        // Fallback to Supabase logic if Worker is not yet configured, 
        // ensuring the app doesn't break during your transition.
        return this.uploadToSupabaseFallback(bucket, path, dataToUpload);
      }

      // 3. Upload to Cloudflare Worker
      // Extract base64 content safely
      let base64Content = dataToUpload;
      if (dataToUpload.includes(',')) {
          base64Content = dataToUpload.split(',')[1];
      }

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bucket,
          key: path,
          contentType: contentType, // Use detected or resized content type
          body: base64Content // Send raw base64
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudflare Worker failed: ${errorText}`);
      }
      
      const result = await response.json();
      return result.url; // The Worker should return the public URL of the uploaded file

    } catch (error: any) {
      console.error('Storage Error:', error);
      alert('Upload Error: ' + error.message);
      return null;
    }
  },

  // Temporary fallback during your infrastructure migration
  async uploadToSupabaseFallback(bucket: string, path: string, fileData: string): Promise<string | null> {
    
    let mimeType = 'application/octet-stream';
    let base64 = fileData;

    // Safe extraction for large strings (PDFs)
    if (fileData.startsWith('data:')) {
        const commaIndex = fileData.indexOf(',');
        if (commaIndex !== -1) {
            const meta = fileData.substring(0, commaIndex);
            const match = meta.match(/data:([^;]+)/);
            if (match) mimeType = match[1];
            base64 = fileData.substring(commaIndex + 1);
        }
    } else if (fileData.includes(',')) {
         // Fallback if just a comma exists but no data: prefix (unlikely but safe)
         base64 = fileData.split(',')[1];
    }

    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    
    // Create Blob with correct MIME type
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });

    const { data, error } = await supabase.storage.from(bucket).upload(path, blob, { 
      upsert: true,
      contentType: mimeType
    });

    if (error) throw error;
    return supabase.storage.from(bucket).getPublicUrl(data.path).data.publicUrl;
  }
};
