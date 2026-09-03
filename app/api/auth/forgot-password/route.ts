import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveIdentifierEmail } from "@/lib/supabase/resolve-identifier";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

/**
 * Requests a password-reset email — identifier resolution and the actual
 * `resetPasswordForEmail` call, both server-side, in one request. See
 * `app/api/auth/sign-in/route.ts`'s own doc for why this moved off the
 * client; the same reasoning applies here.
 *
 * Always answers the same generic way, regardless of whether the
 * identifier resolved to a real account or the send itself failed for an
 * unrelated reason (logged, never surfaced) — the "if an account exists…"
 * copy this app already showed is now enforced in the one response every
 * caller actually receives, not only in how the UI happened to render it,
 * so there is nothing left for a client to distinguish even by inspecting
 * network traffic directly.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "auth");
  if (limited) return limited;

  let body: { identifier?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  if (!identifier) {
    return NextResponse.json({ error: "Enter your email or username." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Cloud accounts are not configured." }, { status: 503 });
  }

  const email = await resolveIdentifierEmail(supabase, identifier);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // request.nextUrl.origin, not a client-supplied value: the server
    // already knows the host this request actually arrived on (matching
    // what window.location.origin would have been for the same request),
    // without trusting a string the caller could otherwise have picked.
    redirectTo: `${request.nextUrl.origin}/auth/callback?redirect_to=${encodeURIComponent("/auth/reset-password")}`,
  });

  if (error) {
    // Logged, never forwarded — whatever went wrong, the response below is
    // identical either way, which is the entire point of this route.
    console.error("TierListOnline: password reset request failed —", error.message);
  }

  return NextResponse.json({ ok: true });
}
