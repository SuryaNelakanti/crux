import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>;

// Placeholder for generated types from Supabase CLI
// Run `pnpm supabase:types` to generate this
// Using permissive types until then
export type Database = {
    public: {
        Tables: {
            users: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            sessions: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            problems: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            problem_members: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            media: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            route_masks: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            user_problem_logs: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
            events: { Row: AnyRow; Insert: AnyRow; Update: AnyRow };
        };
        Views: Record<string, never>;
        Functions: {
            resolve_problem_share_token: {
                Args: { p_token: string };
                Returns: string | null;
            };
            join_problem_with_token: {
                Args: { p_token: string };
                Returns: string | null;
            };
        };
        Enums: Record<string, never>;
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
