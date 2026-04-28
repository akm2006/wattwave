import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Initializes the Supabase client with dynamic credentials.
 * This is called after fetching the secure config from /api/config.
 */
export function initSupabase(url: string, key: string) {
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

/**
 * Proxy-like getter for the Supabase instance.
 * Automatically initializes on the server if environment variables are present.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!supabaseInstance) {
      // Check if we can auto-initialize (Server-side)
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_ANON_KEY;

      if (url && key) {
        supabaseInstance = createClient(url, key);
      } else {
        throw new Error(
          "Supabase client not initialized. On the client, call initSupabase(). On the server, ensure SUPABASE_URL and SUPABASE_ANON_KEY are set."
        );
      }
    }
    return (supabaseInstance as any)[prop];
  },
});
