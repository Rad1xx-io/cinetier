import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

/**
 * Turns whatever someone typed into the password sign-in/forgot-password
 * field — an email, or an existing username — into the email
 * `signInWithPassword`/`resetPasswordForEmail` need, both of which only ever
 * take an email.
 *
 * This is also where password sign-in's own rate limiting lives, and that is
 * the real reason this route exists rather than the client resolving a
 * username straight from a `supabase.rpc()` call: every attempt — email or
 * username, sign-in or a forgot-password request — passes through here
 * first, so this is the one place that sees all of them and can count them
 * against the same budget (migration 025's `resolve_username_email` has its
 * own second ceiling for a caller that skips this route entirely and calls
 * the RPC directly, but that layer alone would not stop someone who already
 * has a resolved email from hammering `signInWithPassword` with different
 * passwords against it).
 *
 * Deliberately enumeration-safe: a username with no matching account is
 * handed back unchanged rather than as a distinct "no such user" error, so
 * whatever calls `signInWithPassword` next fails the same generic way for a
 * wrong password and for a username that was never registered. This route
 * never says which.
 */

export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "auth");
  if (limited) return limited;

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Cloud accounts are not configured." }, { status: 503 });
  }

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

  // Already email-shaped: nothing to resolve, and no reason to spend the
  // RPC's own rate-limit budget on a lookup this does not need.
  if (EMAIL_PATTERN.test(identifier)) {
    return NextResponse.json({ email: identifier });
  }

  const { url, anonKey } = getSupabaseEnv();
  const supabase = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("resolve_username_email", {
    p_username: identifier,
  });

  if (error) {
    // Logged, not forwarded — the same discipline as /api/post-views: a
    // failed lookup is not the caller's problem to see the internals of.
    console.error("TierListOnline: username resolution failed —", error.message);
  }

  // Whatever the RPC found — or, when it found nothing, the raw identifier
  // unchanged — is handed back rather than a distinct refusal. See the
  // module doc for why: this is what keeps the response from being a way to
  // test which usernames are registered.
  const email = typeof data === "string" && data.length > 0 ? data : identifier;
  return NextResponse.json({ email });
}
