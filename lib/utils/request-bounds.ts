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
 * The largest external catalogue id worth forwarding.
 *
 * TMDB, AniList and Steam all number in the millions; ten million is comfortably
 * past every real id and short of the point where the value stops being a
 * plausible id at all. `Number.isFinite` alone was letting `-1`, `1.5` and
 * `1e300` through to an upstream request, all of which can only ever come back
 * as an error somebody else's quota paid for.
 */
export const MAX_EXTERNAL_ID = 10_000_000;

/**
 * A positive integer id, or null when the value cannot be one.
 *
 * Returns null rather than clamping: a page number that is out of range still
 * has an obvious sensible answer, and an id does not — a caller asking for
 * film `-1` has not asked for film 1, so the honest reply is 400 rather than a
 * different film's details.
 */
export function boundedExternalId(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  /*
   * Digits only, checked before `Number()` ever sees the value. `Number()` is
   * happy with `"0x1f"`, `"1e300"` and `"Infinity"`, and none of those is an id
   * anybody typed — but each was finite, which is all the two details routes
   * used to ask.
   *
   * Surrounding whitespace is forgiven rather than refused: `?id=%2012%20` is a
   * sloppy caller, not a hostile one, and 12 is unambiguously what they meant.
   */
  if (!/^\d+$/.test(raw.trim())) return null;
  const parsed = Number(raw.trim());
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_EXTERNAL_ID) return null;
  return parsed;
}

/**
 * A single YouTube channel id.
 *
 * `channels.list` takes a comma-separated list of up to fifty ids, and this
 * value used to be forwarded to it verbatim — so one request could ask YouTube
 * about fifty channels, or carry a string of any length at all, on nothing but
 * the caller's word. The route only ever reads `items[0]`, so a list was never
 * useful to anyone but somebody probing what else the parameter would accept.
 *
 * A channel id is `UC` followed by 22 characters of base64url. Matched exactly,
 * which also refuses the comma.
 */
export function boundedChannelId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return /^UC[A-Za-z0-9_-]{22}$/.test(trimmed) ? trimmed : null;
}

/**
 * A short free-text filter value — a genre name, and the like.
 *
 * These are looked up against a known list or passed as a bound query variable
 * rather than spliced into anything, so this is a ceiling on work rather than
 * an injection defence: no genre has a sixty-character name, and a longer value
 * is a string this server would otherwise carry around and hand upstream for
 * no possible result.
 */
export function boundedFilterTerm(raw: string | null | undefined, max = 60): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
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
