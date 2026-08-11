export type MediaType = "movie" | "tv";

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
  mediaType: MediaType;
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

/** The minimal record persisted per title in local storage. */
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
  addedAt: number;
  updatedAt: number;
}

export interface SearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: TitleSummary[];
}

export interface ApiErrorBody {
  error: string;
}
