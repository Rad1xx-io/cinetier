"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

let cachedClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a singleton browser Supabase client, or null if the app isn't
 * configured for cloud accounts (no env vars set) — the whole cloud-sync
 * layer is optional, guest/local-only mode must keep working without it.
 */
export function getSupabaseBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  if (!cachedClient) {
    const { url, anonKey } = getSupabaseEnv();
    cachedClient = createBrowserClient(url!, anonKey!);
  }
  return cachedClient;
}
