import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

/**
 * Sends a signed-in account a link to confirm a password change.
 *
 * The email comes from the caller's own session (`getUser()`), never from a
 * request field — there is no identifier to resolve here at all, so the
 * whole enumeration problem `/api/auth/sign-in`/`/api/auth/forgot-password`
 * had to solve (a caller learning whether some OTHER identifier belongs to
 * an account) structurally cannot recur on this route: a caller with no
 * session gets refused outright, and a caller with one can only ever
 * request a link for the account they are already signed into.
 *
 * Uses the exact same mechanism `/api/auth/forgot-password` already does —
 * `resetPasswordForEmail`, redirecting through the same `/auth/callback` —
 * just authenticated, and with the target `/auth/change-password` instead
 * of `/auth/reset-password`; the two pages differ in what they ask for once
 * the link lands (a reset never needs the current password, a change
 * always does when there is one — see `/api/account/change-password`), not
 * in how the confirmation email itself gets there.
 *
 * Unlike forgot-password, a real failure here is not masked. Forgot-password
 * hides its outcome because the caller might not actually own the account
 * they typed an identifier for — revealing whether the send succeeded would
 * leak whether that account exists. Here the caller already proved account
 * ownership by having a session, so there is nothing left to protect by
 * pretending a failed send succeeded.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "auth");
  if (limited) return limited;

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Cloud accounts are not configured." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in to change your password." }, { status: 401 });
  }

  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${request.nextUrl.origin}/auth/callback?redirect_to=${encodeURIComponent("/auth/change-password")}`,
  });

  if (error) {
    console.error("TierListOnline: password change request failed —", error.message);
    return NextResponse.json(
      { error: "Could not send the confirmation email. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
