import type { Tier, TMDBMediaType, TitleSummary } from "@/lib/types";

/**
 * The shape any import source has to produce, before TMDB ever gets
 * involved. Deliberately not Letterboxd-specific: this is the whole reason a
 * second source (AniList ratings, say) only has to write a parser that
 * emits this and a rating scale to map from — everything downstream
 * (matching, preview, merging) is written once, against this.
 */
export interface ImportRow {
  /** As the source spells it. What TMDB is searched with. */
  title: string;
  /** Null when the source did not record one — matching falls back to title alone. */
  year: number | null;
  /** The source's own rating, on its own scale. Mapped to a Tier by the caller, not here. */
  rating: number;
  /** A link back to the source's own page for this entry, shown in the preview as a sanity check. */
  sourceUrl: string | null;
}

export type MatchConfidence = "exact" | "likely" | "uncertain" | "not-found";

/** What `matchAgainstTmdb` produces: a source row and its best TMDB candidate, nothing about the account yet. */
export interface TmdbMatch {
  source: ImportRow;
  mediaType: TMDBMediaType;
  match: TitleSummary | null;
  confidence: MatchConfidence;
}

/**
 * A `TmdbMatch` filled in with the two things only the account's own state
 * can answer — this is what the preview actually renders and what a person
 * reviews before anything is written.
 *
 * `tier` starts as whatever the source's rating maps to and is the one field
 * the preview lets a person override — everything else here is read-only
 * information about *how* the match was made, not a decision being asked of
 * anyone.
 */
export interface MatchedRow extends TmdbMatch {
  tier: Tier;
  /** Already in the account's tier list under this exact tmdbId/mediaType. */
  alreadyRanked: boolean;
}
