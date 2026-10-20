import { createClient } from '@supabase/supabase-js';

// Public values (safe to ship to the browser). Env vars override them.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qsjgdxiduylsojxauoiy.supabase.co';
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_k-MZN2TXgDXgW5Dk29L_kQ_SPq6hQZD';

let browserClient = null;

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'the-lines-auth' },
    });
  }
  return browserClient;
}

// Server-side client that acts as the signed-in user (uses their access token).
export function getUserClient(authorizationHeader) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorizationHeader } },
  });
}
