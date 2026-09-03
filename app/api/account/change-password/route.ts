import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

/**
 * Changes a signed-in (including a recovery-linked) account's password.
 *
 * Reached only after `/api/account/request-password-change` has mailed a
 * confirmation link and it has been clicked — the recovery session that
 * link establishes (via the existing, unmodified `/auth/callback`) is what
 * `getSupabaseServerClient()` reads below, the same way
 * `/auth/reset-password` already treats a recovery session as an ordinary
 * signed-in one.
 *
 * Whether the current password has to be verified first depends on whether
 * the account has one at all — `account_has_password()` (migration 026)
 * answers that without trusting `user.app_metadata`/`identities`, which
 * this codebase already found unreliable for the exact same question (see
 * that migration's own doc). An account with no password yet is legitimately
 * "set your first password", not a change, and cannot be asked for
 * something that has never existed.
 *
 * Current-password verification is deliberately NOT done by calling
 * `signInWithPassword` on this route's own `supabase` client — that client
 * is the one holding the active recovery session `updateUser` below still
 * needs, and `signInWithPassword` is itself a sign-in action: calling it on
 * the same client risks overwriting or otherwise disturbing that session's
 * cookies as a side effect of what is supposed to be a read-only check,
 * exactly the failure mode worth avoiding rather than discovering in
 * production. A second, throwaway client — session-less, cookie-less,
 * `persistSession: false` — verifies the password in complete isolation:
 * it shares nothing with the recovery-session client, so nothing it does,
 * succeed or fail, can touch that session at all. This is provable by
 * reading its construction (it is handed no cookie store to write to in
 * the first place, unlike `getSupabaseServerClient()`), not merely hoped.
 *
 * The generic-response discipline from `/api/auth/sign-in` does NOT apply
 * to the current-password check itself: that discipline exists to keep an
 * unauthenticated caller from learning whether an identifier belongs to an
 * account. Here the caller already proved account ownership by holding the
 * emailed link, so telling them plainly that the current password they
 * typed is wrong reveals nothing they do not already have a right to know.
 * The response body itself still never carries either password, on any
 * path — that discipline is unconditional.
 */

export const dynamic = "force-dynamic";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "auth");
  if (limited) return limited;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

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

  const { data: hasPasswordData, error: hasPasswordError } = await supabase.rpc("account_has_password");
  if (hasPasswordError) {
    console.error("TierListOnline: could not check account_has_password —", hasPasswordError.message);
    // Fails closed on an unknown answer rather than guessing either
    // direction: guessing "no password" could skip a verification this
    // account genuinely needs; guessing "has a password" could permanently
    // block the legitimate "set my first password" flow if this RPC is
    // the thing that is actually broken. Neither guess is safe, so this
    // asks the caller to retry instead.
    return NextResponse.json(
      { error: "Could not verify your account right now. Please try again." },
      { status: 500 }
    );
  }

  if (hasPasswordData === true) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Enter your current password." }, { status: 400 });
    }

    // The isolated, cookie-less client this route's own doc explains —
    // never getSupabaseServerClient() here, on purpose.
    const { url, anonKey } = getSupabaseEnv();
    const verifier = createClient(url!, anonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (verifyError) {
      // A specific message, deliberately — see the module doc for why this
      // one case does not need the ambiguity /api/auth/sign-in requires.
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  /*
   * Best-effort, and does not affect the response either way: the password
   * itself already changed by this point, which is the part that matters.
   * `scope: "others"` signs out every session but this one — the recovery
   * session that just made this change is deliberately left alone, and per
   * @supabase/auth-js's own documented behaviour for this scope, no
   * SIGNED_OUT event fires for it, so there is nothing for this browser's
   * own session state to react to here either.
   */
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    console.error(
      "TierListOnline: password changed, but other sessions could not be signed out —",
      signOutError.message
    );
  }

  return NextResponse.json({ ok: true });
}
