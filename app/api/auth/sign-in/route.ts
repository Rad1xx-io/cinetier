import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { resolveIdentifierEmail } from "@/lib/supabase/resolve-identifier";
import { rateLimitOrNull } from "@/lib/rate-limit/limiter";

/**
 * Password sign-in — identifier resolution and the actual auth call, both
 * server-side, in one request.
 *
 * This used to be two client-side steps: resolve the identifier through a
 * dedicated route that handed the resolved email straight back in its
 * response, then call `signInWithPassword` in the browser with it. That
 * shape leaked a real PII value — see `resolveIdentifierEmail`'s own doc
 * for the full story. Here, `getSupabaseServerClient()` (the same
 * cookie-writing client `/auth/callback` already uses for the magic-link
 * and Google exchange) performs `signInWithPassword` itself, so the
 * session lands directly in cookies and the email that made it possible
 * never has to travel back to the browser in a JSON body at all.
 *
 * Enumeration-safe the same way the old flow was, just enforced in one
 * fewer place: Supabase's own `signInWithPassword` returns the identical
 * generic error for a wrong password and for an email nothing matches, and
 * `resolveIdentifierEmail` guarantees an unresolved username reaches this
 * call as exactly that second case rather than as a distinct failure.
 */

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await rateLimitOrNull(request, "auth");
  if (limited) return limited;

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !password) {
    return NextResponse.json(
      { error: "Enter your email or username, and your password." },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Cloud accounts are not configured." }, { status: 503 });
  }

  const email = await resolveIdentifierEmail(supabase, identifier);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase's own message, unchanged — it is already the same generic
    // string for both cases this route must not tell apart. Never the
    // email: nothing below this line touches the response body again.
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
