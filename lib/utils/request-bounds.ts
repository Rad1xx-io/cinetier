/**
 * Ceilings for the numbers a visitor can put in a query string.
 *
 * Every catalogue route forwards at least one of these to an upstream API, so
 * an unbounded value is not merely untidy — `?page=999999999` is a request this
 * server makes on somebody's behalf, against a quota it is paying for, for a
 * page that cannot exist. Clamping rather than rejecting keeps a mistyped url
 * showing the first page instead of an error, which is what a person wants and
 * costs an attacker the same either way.
 */

/**
 * The deepest page any of these catalogues will serve.
 *
 * TMDB itself refuses past 500 and the others are shallower, so this is the
 * point beyond which a larger number can only ever produce an upstream error.
 */
export const MAX_PAGE = 500;

/**
 * A page number that is safe to forward.
 *
 * Anything unparseable, negative, fractional or absurd becomes the first page.
 * `zeroBased` is for the callers whose upstream counts from zero — the clamp is
 * the same, only the floor moves.
 */
export function boundedPage(raw: string | number | null | undefined, zeroBased = false): number {
  const floor = zeroBased ? 0 : 1;
  const parsed = typeof raw === "number" ? raw : Number(raw ?? floor);
  if (!Number.isFinite(parsed)) return floor;
  return Math.min(Math.max(Math.floor(parsed), floor), MAX_PAGE);
}

/**
 * A non-negative integer with a ceiling, for filters like "minimum
 * subscribers" that are forwarded as-is.
 */
export function boundedCount(raw: string | number | null | undefined, max: number): number {
  const parsed = typeof raw === "number" ? raw : Number(raw ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(Math.floor(parsed), max);
}

/**
 * An opaque upstream continuation token, bounded and stripped of anything that
 * is not one.
 *
 * YouTube's `pageToken` is forwarded verbatim, so it is worth making sure that
 * what gets forwarded is token-shaped: a long or exotic value is a request this
 * server makes on the caller's word alone.
 */
export function boundedPageToken(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 256) return undefined;
  return /^[A-Za-z0-9_\-=.]+$/.test(trimmed) ? trimmed : undefined;
}

/**
 * A two-letter region code, or nothing.
 *
 * Forwarded to YouTube as `regionCode`, which is an ISO 3166-1 alpha-2 value;
 * anything else is a value this server would be passing on without knowing what
 * it is.
 */
export function boundedRegion(raw: string | null | undefined): string | undefined {
  const trimmed = raw?.trim().toUpperCase();
  return trimmed && /^[A-Z]{2}$/.test(trimmed) ? trimmed : undefined;
}
