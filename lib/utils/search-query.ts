/**
 * Cleans a user-typed search term before it leaves for an upstream catalog.
 *
 * This is not injection defence — TMDB and YouTube take their terms through
 * URLSearchParams and AniList through GraphQL variables, so none of them can be
 * broken out of. It exists because the edge in front of AniList (and IGDB)
 * answers payloads that look like an attack with a bare 403, which reached the
 * user as "не удалось загрузить" rather than an honest empty result. Titles
 * contain none of these characters, so dropping them costs nothing.
 *
 * IGDB keeps its own stricter version in lib/igdb/discovery.ts, because there
 * the term really is spliced into query syntax.
 */
export function sanitizeSearchQuery(raw: string): string {
  return raw
    .replace(/[<>{}\\]/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
