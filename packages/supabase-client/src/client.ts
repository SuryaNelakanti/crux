import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Placeholder for generated types from Supabase CLI
// Run `pnpm supabase:types` to generate this
export type Database = {
    public: {
        Tables: Record<string, unknown>;
        Views: Record<string, unknown>;
        Functions: Record<string, unknown>;
        Enums: Record<string, unknown>;
    };
};

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
    supabaseAnonKey: string
): SupabaseClient {
    if (!supabaseInstance) {
        supabaseInstance = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: false,
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
