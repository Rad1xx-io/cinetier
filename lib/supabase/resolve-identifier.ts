import "server-only";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The one method this module needs off a Supabase client — kept minimal and
 * structural so it takes either the anon or the cookie-bound server client
 * without importing either package's own type. `PromiseLike`, not `Promise`:
 * the real `.rpc()` returns a `PostgrestFilterBuilder`, a thenable rather
 * than an actual `Promise` instance, which `await` accepts identically but
 * a `Promise<...>`-typed parameter would not.
 */
interface RpcCapable {
  rpc(
    fn: "resolve_username_email",
    args: { p_username: string }
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Turns whatever someone typed into the password sign-in/forgot-password
 * field — an email, or an existing username — into the email
 * `signInWithPassword`/`resetPasswordForEmail` need.
 *
 * Server-only, and deliberately never returned to a caller on its own:
 * `/api/auth/sign-in` and `/api/auth/forgot-password` both call this
 * internally and go straight on to use the result against Supabase's own
 * auth methods, in the same request, without it ever crossing back into a
 * response body. It used to — an earlier version of this feature had a
 * dedicated `/api/auth/resolve-identifier` route that resolved a username
 * and handed the email straight back in its JSON response, which meant any
 * unauthenticated caller could POST a username and read back that
 * account's real email, private profile or not (`resolve_username_email`,
 * migration 025, deliberately resolves private profiles too — see its own
 * doc comment for why — which is exactly what made re-exposing its answer
 * to the browser a real PII leak rather than a redundant one). Fixed by
 * moving the entire sign-in/reset action server-side instead of only the
 * resolution step.
 *
 * Falls back to the raw identifier, unresolved, when nothing matches — the
 * enumeration-safe path: whatever calls this next then fails or no-ops the
 * same way it would for an identifier that was never registered at all,
 * and there is nothing in this function's return value that tells "resolved"
 * apart from "fell through".
 */
export async function resolveIdentifierEmail(
  supabase: RpcCapable,
  identifier: string
): Promise<string> {
  if (EMAIL_PATTERN.test(identifier)) return identifier;

  const { data, error } = await supabase.rpc("resolve_username_email", {
    p_username: identifier,
  });

  if (error) {
    // Logged, never forwarded — the same discipline /api/post-views already
    // applies to a failed lookup.
    console.error("TierListOnline: username resolution failed —", error.message);
  }

  return typeof data === "string" && data.length > 0 ? data : identifier;
}
