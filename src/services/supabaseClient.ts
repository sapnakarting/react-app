
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

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

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
