# Cloudflare R2 Setup Guide

This project uses Cloudflare R2 for storing images and documents, with Supabase Storage as a fallback.

## Why Cloudflare R2?
- **Cost**: Cheaper than Supabase Storage for high volume (zero egress fees).
- **Performance**: Edge caching via Cloudflare CDN.

## Setup Instructions

### 1. Create R2 Bucket
1.  Log in to the Cloudflare Dashboard.
2.  Go to **R2** from the sidebar.
3.  Click **Create Bucket**.
4.  Name it: `minetrack-fleet` (or similar).
5.  Click **Create Bucket**.

### 2. Create Worker (Proxy)
Direct R2 uploads from the browser are insecure because they require exposing keys. We use a Worker to proxy the upload.

1.  Go to **Workers & Pages**.
2.  Click **Create Application** -> **Create Worker**.
3.  Name it: `r2-upload-worker`.
4.  Click **Deploy**.
5.  **Edit Code** and paste the following:

```javascript
export default {
  async fetch(request, env) {
    // Define CORS headers globally to ensure they are present in success AND error responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Allow all origins (localhost:3000, etc.)
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle Preflight Request (CORS)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health Check (New: Open URL in browser to verify)
    if (request.method === "GET") {
      return new Response("Worker is active and running!", { status: 200, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { bucket, key, contentType, body } = await request.json();
      
      const BUCKET_BINDINGS = {
        'truck_docs': env.TRUCK_DOCS,
        'fuel_proofs': env.FUEL_PROOFS,
        // Map hyphenated versions too, just in case
        'truck-docs': env.TRUCK_DOCS,
        'fuel-proofs': env.FUEL_PROOFS,
      };

      const PUBLIC_URLS = {
        'truck_docs': 'https://pub-xxxxxxxxxxxx.r2.dev', 
        'fuel_proofs': 'https://pub-yyyyyyyyyyyy.r2.dev',
        'truck-docs': 'https://pub-xxxxxxxxxxxx.r2.dev',
        'fuel-proofs': 'https://pub-yyyyyyyyyyyy.r2.dev',
      };

      const targetBucket = BUCKET_BINDINGS[bucket];
      if (!targetBucket) {
        throw new Error(`Bucket binding not found for '${bucket}'`);
      }

      const buffer = Uint8Array.from(atob(body), c => c.charCodeAt(0));

      await targetBucket.put(key, buffer, {
        httpMetadata: { contentType: contentType },
      });

      const publicUrlRoot = PUBLIC_URLS[bucket];
      if (!publicUrlRoot) {
         throw new Error(`Public URL not configured for '${bucket}'`);
      }

      const publicUrl = `${publicUrlRoot}/${key}`;

      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { 
          "Content-Type": "application/json",
          ...corsHeaders 
        },
      });
    } catch (err) {
      // CRITICAL: Return CORS headers even on error, otherwise the browser hides the actual error message
      return new Response(err.message, { status: 500, headers: corsHeaders });
    }
  },
};
```

### 3. Bind Worker to Buckets (CRITICAL)
1.  Go to your Worker > **Settings** > **Variables** > **R2 Bucket Bindings**.
2.  **Add Binding 1**:
    *   Variable name: `TRUCK_DOCS`
    *   R2 Bucket: Select your `truck_docs` bucket.
3.  **Add Binding 2**:
    *   Variable name: `FUEL_PROOFS`
    *   R2 Bucket: Select your `fuel_proofs` bucket.
4.  Click **Deploy**.

### 4. Enable Public Access & Update Code
1.  Go to **R2** > Click `truck_docs` > **Settings**.
    *   **Public Access** > **R2.dev subdomain** > **Allow Access**.
    *   **COPY** the Public URL (e.g., `https://pub-abc.r2.dev`).
    *   **PASTE** it into the worker code under `PUBLIC_URLS['truck_docs']`.
2.  Go to **R2** > Click `fuel_proofs` > **Settings**.
    *   **Public Access** > **R2.dev subdomain** > **Allow Access**.
    *   **COPY** the Public URL.
    *   **PASTE** it into the worker code under `PUBLIC_URLS['fuel_proofs']`.
3.  **Deploy** the Worker again with these code changes.

### 5. Update Project Config
1.  Copy your **Worker URL** (e.g., `https://r2-upload-worker.myname.workers.dev`).
2.  Open `.env`.
3.  Set:
    ```
    VITE_CLOUDFLARE_WORKER_URL=https://r2-upload-worker.myname.workers.dev
    ```

## Fallback Behavior
If `VITE_CLOUDFLARE_WORKER_URL` is empty in `.env`, the application automatically falls back to using **Supabase Storage**.
