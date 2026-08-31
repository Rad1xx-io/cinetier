import { SITE_URL } from "@/lib/seo/site";

/**
 * Keeps a caller-supplied redirect target inside this app.
 *
 * The auth callback takes its destination from the query string, so this value
 * is attacker-controlled in the most direct sense: anyone can put anything
 * after `?redirect_to=` in a link and send it to somebody.
 *
 * This used to be a set of string prefix checks — reject `//`, reject a
 * backslash — and those are not enough, because the check and the consumer do
 * not read the string the same way. `new URL()` implements WHATWG parsing,
 * which *removes every ASCII tab, newline and carriage return from the input
 * before it parses anything*. `?redirect_to=/%09/evil.com` arrives at
 * `searchParams.get()` decoded to `/\t/evil.com`, which starts with a single
 * `/`, contains no backslash, and passed every check — and then became
 * `//evil.com`, and then `https://evil.com`, inside the parser.
 *
 * So the parser decides, not the string. The value is handed to the same
 * implementation the consumer will use, and what comes back out is what gets
 * judged.
 */

/**
 * The origin this app considers its own.
 *
 * Read from the canonical site url rather than from the incoming request: the
 * request's host is itself attacker-influenced (a forged `Host` header), and
 * only a value that came from configuration can be trusted as "us".
 *
 * The parse cannot realistically fail — `SITE_URL` has a literal fallback —
 * but if a deployment ever set `NEXT_PUBLIC_SITE_URL` to something unparseable
 * the fallback here keeps this function fail-closed rather than throwing on
 * every sign-in.
 */
const TRUSTED_ORIGIN = (() => {
  try {
    return new URL(SITE_URL).origin;
  } catch {
    return "https://tierlistonline.com";
  }
})();

/**
 * Whether a resolved path could still leave the origin when it is resolved a
 * second time.
 *
 * This is the trap in the obvious version of this fix. Comparing origins is
 * necessary and not sufficient: `/..//evil.com` parses to *this* origin —
 * `..` is consumed by path normalisation — while its `pathname` is
 * `//evil.com`, which is protocol-relative. Returning that pathname to a
 * caller who resolves it against a base url hands them `https://evil.com`
 * after the origin check has already passed.
 *
 * Verified against `/..//evil.com`, `/./..//evil.com` and
 * `/a/../../..//evil.com`, all of which normalise to a `//` pathname.
 */
function escapesOnReresolution(path: string): boolean {
  return !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\");
}

/**
 * A rooted, same-origin path, or the fallback.
 *
 * Returns only `pathname + search + hash` — never an absolute url — so the
 * result cannot carry an origin of its own no matter what the caller does with
 * it. Every component comes back from the parser already normalised and
 * percent-encoded, which is what disposes of the control-character variants:
 * they are gone before this function sees the result.
 *
 * `javascript:` and `data:` need no special case. Both parse to an opaque
 * origin — the string "null" — which is not `TRUSTED_ORIGIN`, so they are
 * rejected by the same comparison that rejects `https://evil.com`.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;

  /*
   * A backslash is refused before parsing rather than resolved through it.
   *
   * Not the primary defence — the origin comparison below is — but the parser
   * folds `\` to `/` in a special scheme, so `/path\..\other` quietly resolves
   * to `/other`. That destination is same-origin and therefore harmless, yet
   * it is not the path anybody typed, and this function's job is to hand back
   * somewhere the caller actually asked to go. Rejecting outright also keeps
   * the behaviour this function had before it was rewritten, which the suite
   * pins.
   */
  if (raw.includes("\\")) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, TRUSTED_ORIGIN);
  } catch {
    // A value the parser refuses outright is not a destination.
    return fallback;
  }

  if (parsed.origin !== TRUSTED_ORIGIN) return fallback;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (escapesOnReresolution(path)) return fallback;

  return path;
}
