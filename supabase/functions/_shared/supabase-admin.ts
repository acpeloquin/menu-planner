import { createClient } from 'npm:@supabase/supabase-js@2';

// Client service role : à utiliser uniquement côté edge function (jamais côté client).
// Bypass RLS — les fonctions qui l'utilisent doivent valider elles-mêmes l'accès.
export function createAdminClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceRoleKey);
}
