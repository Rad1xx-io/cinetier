import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/utils/safe-redirect";

/**
 * Where both sign-in routes land: the magic-link email and the Google OAuth
 * redirect. Exchanges the PKCE code for a session, which writes the auth
 * cookies, then continues into the app.
 */

/**
 * The only values this route will put in front of a browser.
 *
 * A failure used to travel out as `?reason=${error.message}` — the provider's
 * own words, whatever they happened to be. In production that produced a
 * `Location` header carrying Supabase's internal explanation of PKCE storage
 * and a suggestion about which library to use on the server, which is a
 * description of this deployment's internals handed to anyone who can make the
 * exchange fail. The next one might describe the database instead.
 *
 * So the wire carries a code from this list and nothing else. The real message
 * still goes to the server log, where it is useful and not public.
 */
const REASON_CODES = {
  noCode: "no-code",
  notConfigured: "not-configured",
  exchangeFailed: "exchange-failed",
} as const;

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeRedirectPath(request.nextUrl.searchParams.get("redirect_to"));

  if (!code) {
    return NextResponse.redirect(
      new URL(`/auth/auth-code-error?reason=${REASON_CODES.noCode}`, request.url)
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL(`/auth/auth-code-error?reason=${REASON_CODES.notConfigured}`, request.url)
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    /*
     * The message stays here and goes no further. Logged rather than
     * forwarded: whoever is debugging this needs the provider's exact words,
     * and whoever triggered the failure does not.
     *
     * `code` is deliberately not logged alongside it. It is single-use and
     * already spent by the time this runs, but a log line is a different
     * lifetime from a request, and there is nothing to learn from it here.
     */
    console.error("TierListOnline: auth code exchange failed —", error.message);
    return NextResponse.redirect(
      new URL(`/auth/auth-code-error?reason=${REASON_CODES.exchangeFailed}`, request.url)
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
