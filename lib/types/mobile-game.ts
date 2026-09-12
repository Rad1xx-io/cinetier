/**
 * Which catalog `appId` came from. One value today — the App Store is the
 * only mobile catalog this app integrates with (see .ai/DECISIONS.md,
 * "Mobile Games" — Google Play was explicitly deferred, not merely unbuilt
 * yet). Kept as its own type from day one anyway, the same lesson migrations
 * 031/032 already paid for once each on `game`/`anime`: a second mobile
 * catalog, if one is ever added, extends this type instead of retrofitting
 * every row ranked before it existed.
 */
export type MobileGameSource = "app_store";

/** Normalized shape used for mobile game search results and discovery listings. */
export interface MobileGameSummary {
  /** iTunes Search API's `trackId`. */
  appId: number;
  source: MobileGameSource;
  title: string;
  /**
   * The App Store's own icon artwork (`artworkUrl512`) — square, unlike a
   * movie/TV/Steam poster's 2:3 portrait shape. `Poster` (`components/
   * movie-card/poster.tsx`) crops it to fit rather than gaining a second
   * layout, the same tradeoff an AniList cover already makes there.
   */
  posterPath: string | null;
  developer: string;
  shortDescription: string;
  genres: string[];
  /** ISO `YYYY-MM-DD`, sliced from the API's full timestamp. */
  releaseDate: string | null;
  /** `averageUserRating` (0-5) rescaled to 0-10, matching GameSummary's own convention. */
  score: number | null;
  ratingCount?: number;
  isFree: boolean;
  /** `formattedPrice`, already localized by the API — not re-formatted here. */
  price: string | null;
}

/** Normalized shape used for the mobile game details page. */
export interface MobileGameDetails extends MobileGameSummary {
  /** `trackViewUrl` — the App Store's own listing, since nothing else here can host reviews, screenshots or an install button. */
  storeUrl: string;
  minimumOsVersion: string | null;
}

export interface MobileGameSearchResponse {
  results: MobileGameSummary[];
  hasMore: boolean;
  stale?: boolean;
}
