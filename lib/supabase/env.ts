/**
 * Reads the two public Supabase env vars used by both the browser and server
 * clients. Both are safe to expose client-side by design — Supabase access is
 * governed by Row Level Security policies, not by keeping this key secret.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

/** Cloud sync (accounts) is an optional layer — the app must keep working in guest/local-only mode without it configured. */
export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey);
}
