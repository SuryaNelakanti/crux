import { createClient, type SupabaseClient } from '@crux/supabase-client';
import Constants from 'expo-constants';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const extras = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extras?.supabaseUrl ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extras?.supabaseAnonKey ?? '';

  if (!url || !anonKey) {
    return null;
  }

  cachedClient = createClient(url, anonKey);
  return cachedClient;
}
