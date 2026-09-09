import type { CriterionScore } from "@/lib/types/criteria";
import type { GameSource } from "@/lib/types/game";
import type { AnimeCatalogSource } from "@/lib/types/anime";

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
  /**
   * How many TMDB users the `voteAverage` averages over. Optional because
   * nothing displayed it before; structured data needs it, since a rating
   * without a sample size is not a rating a search engine will show.
   */
  voteCount?: number;
}

/** The minimal record persisted per title in local storage. `tmdbId` holds the
 *  external numeric id from whichever source the mediaType implies (TMDB for
 *  movie/tv, AniList *or* MyAnimeList for anime, Steam *or* IGDB for game) —
 *  disambiguated by `gameSource`/`animeSource` below wherever a bare id alone
 *  is no longer a safe identity. */
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
   * Which catalog `tmdbId` came from — meaningful only for `mediaType: "game"`.
   * Steam appids and IGDB ids are different, overlapping number spaces (see
   * `lib/games/source.ts`), so this is what keeps a Steam-sourced entry and an
   * IGDB-sourced entry that happen to share a number from being treated as the
   * same game everywhere an id alone used to stand in for identity — the
   * database's own uniqueness, cloud sync, a battle's item id, a widget's
   * render key. Absent on movie/tv/anime, and on any game ranked before this
   * field existed — there is no way to recover which catalog those came from,
   * so absent means "unknown", not "native".
   */
  gameSource?: GameSource;
  /**
   * Which catalog `tmdbId` came from — meaningful only for `mediaType: "anime"`.
   * The anime equivalent of `gameSource` above, added for the identical reason:
   * AniList ids and MyAnimeList/Jikan ids are different, overlapping number
   * spaces (see `lib/anime-sources/anime-source.ts`'s `AnimeSourceId`), so this
   * is what keeps an AniList-sourced entry and a Jikan-sourced entry that
   * happen to share a number from being treated as the same anime everywhere
   * a bare id used to stand in for identity. Absent on movie/tv/game, and on
   * any anime ranked before this field existed — absent means "unknown", not
   * "the AniList catalogue", even though AniList is this app's default.
   */
  animeSource?: AnimeCatalogSource;
  /**
   * The user's own breakdown, when they filled one in. Absent on everything
   * ranked before criteria existed, and on anything judged by tier alone —
   * which is the common case, so nothing downstream may assume it is there.
   */
  criteriaScores?: CriterionScore[];
  /**
   * Where this can be watched, keyed by service id (see AFFILIATE_PROVIDERS).
   * Optional and usually absent: nothing in the app populates it yet, so every
   * consumer must treat an empty result as the normal case, not an error.
   */
  affiliateLinks?: Record<string, string>;
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
