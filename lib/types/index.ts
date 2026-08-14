import type { CriterionScore } from "@/lib/types/criteria";

export type MediaType = "movie" | "tv" | "anime" | "game";

/** TMDB only ever produces these two — narrower than the shared ranking MediaType so movie/tv-only components (mediaTypeLabel, DiscoverCard, TitleDetailsView) can't accidentally be handed "anime". */
export type TMDBMediaType = "movie" | "tv";

export type Tier = "S" | "A" | "B" | "C" | "D" | "F";

export type TierOrUnrated = Tier | "Unrated";

export const TIERS: Tier[] = ["S", "A", "B", "C", "D", "F"];

export const TIER_ORDER: TierOrUnrated[] = ["S", "A", "B", "C", "D", "F", "Unrated"];

export interface TMDBGenre {
  id: number;
  name: string;
}

/** Normalized shape used for search results and popular listings (movie or tv). */
export interface TitleSummary {
  tmdbId: number;
  mediaType: TMDBMediaType;
  title: string;
  originalTitle: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  overview: string;
  voteAverage: number;
  genreIds: number[];
}

/** Normalized shape used for the title details page. */
export interface TitleDetails extends TitleSummary {
  genres: TMDBGenre[];
  runtime: number | null;
  numberOfSeasons: number | null;
  status: string | null;
}

/** The minimal record persisted per title in local storage. `tmdbId` holds the
 *  external numeric id from whichever source the mediaType implies (TMDB for
 *  movie/tv, AniList for anime) — namespaced by mediaType in `titleKey`, so
 *  ids never collide across sources without needing a separate field. */
export interface RankedTitle {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  tier: TierOrUnrated;
  /** Position within its tier, ascending. Lets cards be manually reordered within a row. */
  order: number;
  /** TMDB rating at the time of adding, for the optional "sort by rating" view. Optional so older exports without it still validate. */
  voteAverage?: number;
  /**
   * The user's own breakdown, when they filled one in. Absent on everything
   * ranked before criteria existed, and on anything judged by tier alone —
   * which is the common case, so nothing downstream may assume it is there.
   */
  criteriaScores?: CriterionScore[];
  addedAt: number;
  updatedAt: number;
}

export interface SearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: TitleSummary[];
  /** Spelling that rescued a thin search, for the "возможно, вы искали" hint. */
  correctedQuery?: string | null;
}

export interface ApiErrorBody {
  error: string;
}
