import type { RankedTitle } from "@/lib/types";
import { titleKey } from "@/lib/storage/repository";
import { forkTitles } from "@/lib/storage/fork";
import type { MatchedRow, TmdbMatch } from "@/lib/import/types";
import { mapRatingToTier, type ScaleTierMap } from "@/lib/import/tier-mapping";

/**
 * Fills in the two things a `TmdbMatch` cannot answer on its own — the tier
 * and whether it is already ranked — so the preview has everything it
 * needs. Pure: takes the account's current titles as a snapshot rather than
 * reading storage itself, the same reason `forkItems` does.
 */
export function buildPreviewRows(
  matches: TmdbMatch[],
  currentTitles: RankedTitle[],
  scale: ScaleTierMap
): MatchedRow[] {
  const ranked = new Set(currentTitles.map((t) => titleKey(t.tmdbId, t.mediaType)));

  return matches.map((m) => ({
    ...m,
    tier: mapRatingToTier(m.source.rating, scale),
    alreadyRanked: m.match ? ranked.has(titleKey(m.match.tmdbId, m.mediaType)) : false,
  }));
}

export interface ImportPlan {
  /** The full list to write in one `reorderAll` call. */
  items: RankedTitle[];
  added: number;
  /** Matched, but already ranked — kept as they were, per the decision below. */
  skippedDuplicates: number;
  /** Whether this import is the account's very first ranked title of any kind. */
  isFirstTitleEver: boolean;
  /** Whether this import is the account's first *film*, specifically — see trackListCreationStarted. */
  startsMovieCatalog: boolean;
}

/**
 * What to do about a row that matches something already in the account's
 * list: skip it, keeping whatever tier is already there.
 *
 * Not "update to match the import" — deliberately. A duplicate here means
 * the account already made a decision about this title some other way,
 * possibly by hand, possibly a tier moved since. An import silently
 * replacing that would be the one outcome nobody asked for when they
 * clicked "import my ratings", the same reasoning `forkItems` already
 * applies to someone else's board: the account's own data wins a collision.
 * Changing an existing tier afterward is one click on the tier list itself,
 * which is a smaller ask than a second "update existing?" toggle on top of
 * an already-multi-step import flow — see .ai/DECISIONS.md for the fuller
 * case, including why this was reconsidered rather than assumed.
 *
 * Only rows the caller has *confirmed* (kept checked in the preview, an
 * actual TMDB match) are written — an excluded or unmatched row contributes
 * nothing here, which is what makes "confirm" a real gate rather than a
 * formality.
 */
export function buildImportPlan(confirmed: MatchedRow[], currentTitles: RankedTitle[]): ImportPlan {
  const now = Date.now();
  const writable = confirmed.filter((row) => row.match !== null);

  const incoming: RankedTitle[] = writable.map((row) => ({
    tmdbId: row.match!.tmdbId,
    mediaType: row.mediaType,
    title: row.match!.title,
    posterPath: row.match!.posterPath,
    releaseDate: row.match!.releaseDate,
    tier: row.tier,
    order: 0, // renumbered by forkTitles/normaliseOrder below
    voteAverage: row.match!.voteAverage,
    addedAt: now,
    updatedAt: now,
  }));

  /*
   * Read before the write, the same rule addTitle() and useRankedTitles's
   * add() already follow and for the same reason: "was this account's list
   * empty" is a fact about the moment before the write, not after it, and a
   * bulk import is exactly the kind of action that plausibly *is* someone's
   * first ranked title, or their first film specifically — the funnel
   * should not go blind just because the first title arrived a thousand at
   * a time instead of one at a time.
   */
  const isFirstTitleEver = currentTitles.length === 0;
  const startsMovieCatalog = !currentTitles.some((t) => t.mediaType === "movie");

  const result = forkTitles(currentTitles, incoming, "merge", now);

  return {
    items: result.items,
    added: result.added,
    skippedDuplicates: writable.length - result.added,
    isFirstTitleEver,
    startsMovieCatalog,
  };
}
