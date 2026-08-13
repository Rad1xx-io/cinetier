/** Normalized shape used for game search results and discovery listings. */
export interface GameSummary {
  appId: number;
  title: string;
  /**
   * Portrait 600x900 library art — same 2:3 shape as movie/anime posters, so
   * games sit in the shared tier list unchanged. Steam 404s it for part of the
   * catalog, so treat it as best-effort and pair it with `fallbackImage`.
   */
  posterPath: string | null;
  /** Landscape store capsule, used for the wide details banner. */
  headerImage: string | null;
  /** Always-present store art, shown when the portrait poster fails to load. */
  fallbackImage: string | null;
  shortDescription: string;
  genres: string[];
  /** Steam store features — "Одиночная игра", "Кооператив", "Многопользовательская игра", … */
  categories: string[];
  platforms: string[];
  developers: string[];
  /** ISO-ish `YYYY-01-01`; Steam only exposes a localized display string. */
  releaseDate: string | null;
  /** Metacritic 0-100 rescaled to 0-10 so it lines up with TMDB/AniList scores. */
  score: number | null;
  isFree: boolean;
  price: string | null;
}

/** Normalized shape used for the game details page. */
export interface GameDetails extends GameSummary {
  publishers: string[];
  website: string | null;
}

export interface GameSearchResponse {
  results: GameSummary[];
  hasMore: boolean;
  /** Results came from cache because the upstream store was unavailable. */
  stale?: boolean;
}
