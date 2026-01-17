import { createClient, getClient, type SupabaseClient } from '@crux/supabase-client';

let cachedClient: SupabaseClient | null = null;

export function initSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }
  cachedClient = createClient(url, anonKey, { detectSessionInUrl: true });
  return cachedClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  try {
    return getClient();
  } catch {
    return initSupabaseClient();
  }
}
