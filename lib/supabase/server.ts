import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Server-side Supabase client for Route Handlers (e.g. the magic-link auth
 * callback), which can write the refreshed session back to cookies. Returns
 * null when cloud accounts aren't configured — callers must handle that.
 */
export async function getSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a context that can't set cookies (e.g. a Server
          // Component render) — the middleware is responsible for refreshing
          // the session in that case.
        }
      },
    },
  });
}
