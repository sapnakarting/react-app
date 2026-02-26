
import { createClient } from '@supabase/supabase-js';

// Helper to safely access environment variables
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

const supabaseUrl = getEnv('VITE_SUPABASE_URL').trim();
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY').trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing! Check .env file.');
  // In development, we might want to alert the user
  if (getEnv('DEV')) {
    alert('Supabase credentials missing! Check .env file.');
  }
} else {
    console.log("%c🔌 SUPABASE: Connected via .ENV variables", "color: #10b981; font-weight: bold; font-size: 12px;");
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
export const isUsingEnvVars = !!(supabaseUrl && supabaseAnonKey);

// Help non-technical users diagnose connection issues
export const checkSupabaseConnection = async (): Promise<{ success: boolean; message: string }> => {
  if (!isUsingEnvVars) {
    return { success: false, message: "Supabase credentials are not configured in .env file." };
  }

  try {
    // Try to fetch something small to verify connection
    const { error } = await supabase.from('trucks').select('id').limit(1);
    
    if (error) {
      if (error.message.includes("fetch")) {
        return { 
          success: false, 
          message: "The application cannot reach the database server. This is often caused by a bad internet connection, a firewall, or a DNS issue." 
        };
      }
      return { success: false, message: `Database responded with an error: ${error.message}` };
    }
    
    return { success: true, message: "Connected successfully." };
  } catch (err) {
    return { 
      success: false, 
      message: "Network Error: Could not establish a connection. Please check your internet or try a different network." 
    };
  }
};
