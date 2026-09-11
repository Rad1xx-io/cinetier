export type AnimeSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type AnimeStatus = "FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS";

/**
 * Which catalogue `anilistId` actually names. Not called `AnimeSource` —
 * that name is already `lib/anime-sources/anime-source.ts`'s interface for a
 * catalogue *implementation* (search/getDetails/getGenres), a different
 * shape entirely; reusing it here for a two-value id tag would collide two
 * unrelated exports under one name. `lib/anime-sources/anime-source.ts`'s
 * `AnimeSourceId` is this same type, re-exported under its established name
 * so nothing importing it has to change.
 */
export type AnimeCatalogSource = "anilist" | "jikan";

export interface AnimeTitleVariants {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

/** Normalized shape used for anime search results and discovery listings. */
export interface AnimeSummary {
  anilistId: number;
  /**
   * Which catalogue `anilistId` names. Stamped by the mapper that built this
   * object (`lib/anilist/mappers.ts`, `lib/anime-sources/jikan-adapter.ts`),
   * each of which unambiguously knows which one it is. Not to be confused
   * with `AnimeDetails.source` below, MyAnimeList's own "source material"
   * field (manga, light novel, original, …) — an unrelated concept that
   * happened to claim the shorter name first.
   */
  catalogSource: AnimeCatalogSource;
  title: string;
  titles: AnimeTitleVariants;
  coverImage: string | null;
  bannerImage: string | null;
  description: string;
  year: number | null;
  season: AnimeSeason | null;
  episodes: number | null;
  duration: number | null;
  status: AnimeStatus | null;
  genres: string[];
  /** 0-10, normalized from AniList's 0-100 averageScore so it lines up with TMDB's voteAverage scale. */
  score: number | null;
  favourites: number | null;
  studios: string[];
  format: string | null;
}

export interface AnimeRelation {
  anilistId: number;
  title: string;
  relationType: string;
  coverImage: string | null;
  format: string | null;
}

/** Normalized shape used for the anime details page. */
export interface AnimeDetails extends AnimeSummary {
  source: string | null;
  relations: AnimeRelation[];
  /**
   * How many users scored the entry — AniList's score distribution summed,
   * MyAnimeList's `scored_by`. Absent when the source did not report it.
   */
  scoredBy?: number;
}

export interface AnimeSearchResponse {
  results: AnimeSummary[];
  hasNextPage: boolean;
  /** Spelling that rescued a thin search, for the "возможно, вы искали" hint. */
  correctedQuery?: string | null;
}
