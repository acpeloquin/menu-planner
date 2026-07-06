import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Une fois le projet Supabase lié, régénérer les types avec
// `supabase gen types typescript` et passer <Database> ici.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
