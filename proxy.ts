import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * Refreshes the Supabase auth session cookie on every request. Required by
 * @supabase/ssr so a token refresh mid-session doesn't silently log the user
 * out. No-ops entirely when cloud accounts aren't configured — guest/local
 * mode never touches this.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touches the session so an expiring token gets refreshed and the new
  // cookie is written back via setAll above.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /**
   * `/auth/callback` is deliberately excluded.
   *
   * The proxy calls getUser() on every matched request. On the callback there is
   * no session yet — only the PKCE verifier cookie the exchange is about to
   * need — and that failed lookup makes @supabase/ssr write auth cookies back
   * through setAll, clearing the verifier before the route handler ever runs.
   * The exchange then fails and the user lands signed-out, which is precisely
   * the "Google returns a token but nothing is saved" symptom.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|auth/callback).*)"],
};
