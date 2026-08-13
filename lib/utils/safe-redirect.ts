/**
 * Keeps a caller-supplied redirect target inside this app.
 *
 * The auth callback takes its destination from the query string, and
 * `new URL(value, base)` resolves an absolute value as-is — so
 * `?redirect_to=https://example.com` would have made the sign-in endpoint
 * forward anywhere, which is the exact shape a phishing link wants. Only a
 * plain rooted path survives; everything else falls back to the home page.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  // "//evil.com" is protocol-relative and would leave the origin, as would any
  // scheme; a backslash is folded to "/" by some browsers, so it goes too.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.includes("\\")) return fallback;
  return raw;
}
