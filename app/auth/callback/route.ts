import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

/**
 * Where both sign-in routes land: the magic-link email and the Google OAuth
 * redirect. Exchanges the PKCE code for a session, which writes the auth
 * cookies, then continues into the app.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("redirect_to"));

  if (!code) {
    return NextResponse.redirect(new URL("/auth/auth-code-error?reason=no-code", request.url));
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL("/auth/auth-code-error?reason=not-configured", request.url)
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Previously this failure was swallowed and the user was redirected as if
    // nothing had happened — landing signed-out with no explanation anywhere.
    console.error("TierListOnline: auth code exchange failed", error.message);
    return NextResponse.redirect(
      new URL(`/auth/auth-code-error?reason=${encodeURIComponent(error.message)}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
