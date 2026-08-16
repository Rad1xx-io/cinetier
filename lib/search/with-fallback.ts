import { normalizeQuery } from "@/lib/search/normalize-query";

/**
 * Below this, a search is treated as having found nothing useful and the
 * alternative spellings are tried. Not zero: "майкрафт" can return one
 * unrelated match through fuzzy indexing upstream, and stopping there would
 * hide the game the user was actually after.
 */
export const MIN_RESULTS_BEFORE_FALLBACK = 3;

export interface FallbackSearchResult<T> {
  results: T[];
  /** The spelling that rescued a thin search, for the "возможно, вы искали" hint. Null when the original sufficed. */
  correctedQuery: string | null;
}

export interface FallbackOptions {
  /**
   * Extra spellings to try, for a source whose index is fussier than the
   * normalizer knows about — AniList matching Cyrillic synonyms only in their
   * stored casing, for instance. Tried straight after the original, before the
   * normalizer's own alternatives, since a source-specific quirk is the more
   * likely explanation for a thin result than a typo.
   */
  extraVariants?: (query: string) => string[];
}

/**
 * Runs a catalog search, reaching for a corrected spelling only if needed.
 *
 * The original always goes first and its results always come first: a query
 * that works must not be second-guessed. Alternatives are appended, never
 * substituted, so a good original result set is only ever added to.
 */
export async function searchWithFallback<T>(
  rawQuery: string,
  run: (term: string) => Promise<T[]>,
  keyOf: (item: T) => string,
  options: FallbackOptions = {}
): Promise<FallbackSearchResult<T>> {
  const { variants, corrected } = normalizeQuery(rawQuery);
  if (variants.length === 0) return { results: [], correctedQuery: null };

  const extras = options.extraVariants?.(variants[0]) ?? [];
  const ordered = [variants[0], ...extras, ...variants.slice(1)];
  // Compared exactly, not case-insensitively: an extra variant may differ from
  // the original in nothing but capitalisation, and that is precisely the point
  // of it when a source matches its index case-sensitively.
  const attempts = ordered.filter(
    (term, index) => term && ordered.indexOf(term) === index
  );

  const results = await run(attempts[0]);
  if (results.length >= MIN_RESULTS_BEFORE_FALLBACK || attempts.length === 1) {
    return { results, correctedQuery: null };
  }

  const seen = new Set(results.map(keyOf));
  const merged = [...results];
  let correctedQuery: string | null = null;

  for (const term of attempts.slice(1)) {
    let extra: T[];
    try {
      extra = await run(term);
    } catch {
      // A failing fallback must not sink a search the original already answered.
      continue;
    }

    let added = false;
    for (const item of extra) {
      const key = keyOf(item);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
        added = true;
      }
    }

    // Only claim a correction that actually produced something new, and only
    // when it really is one — a transliterated variant rescues the search
    // silently, because the user made no mistake to point out.
    if (added && !correctedQuery && term === corrected) correctedQuery = term;
    if (merged.length >= MIN_RESULTS_BEFORE_FALLBACK) break;
  }

  return { results: merged, correctedQuery };
}
