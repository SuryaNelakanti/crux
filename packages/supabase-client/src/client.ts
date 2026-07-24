import type { Database as GeneratedDatabase } from '@crux/shared';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export type Database = GeneratedDatabase;

export type SupabaseClient = ReturnType<typeof createSupabaseClient<Database>>;

let supabaseInstance: SupabaseClient | null = null;

/**
 * Create or get the Supabase client instance
 *
 * @param supabaseUrl - Supabase project URL
 * @param supabaseAnonKey - Supabase anonymous key
 * @returns Typed Supabase client
 */
export function createClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  options?: { detectSessionInUrl?: boolean }
): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: options?.detectSessionInUrl ?? false,
      },
    });
  }
  return supabaseInstance;
}

/**
 * Get the existing Supabase client instance
 * Throws if client hasn't been initialized
 */
export function getClient(): SupabaseClient {
  if (!supabaseInstance) {
    throw new Error('Supabase client not initialized. Call createClient first.');
  }
  return supabaseInstance;
}

/**
 * Reset the client instance (for testing)
 */
export function resetClient(): void {
  supabaseInstance = null;
}
