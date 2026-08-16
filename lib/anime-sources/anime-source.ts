import type { AnimeFormat, AnimeSortMode } from "@/lib/anilist/anime-filters";
import type {
  AnimeDetails,
  AnimeSearchResponse,
  AnimeSeason,
  AnimeStatus,
} from "@/lib/types/anime";

/**
 * Which catalogue answers the anime routes.
 *
 * Two of them exist because one is not enough: AniList went down in November
 * and took the whole tab with it. The interface below is what lets a second
 * source stand in without the routes or the UI knowing which one they got.
 */
export type AnimeSourceId = "anilist" | "jikan";

/** Everything the discover page can ask for, in the vocabulary the UI already speaks. */
export interface AnimeQuery {
  query?: string;
  /** Genre *name*, as the filter dropdown lists it — sources map it to their own ids. */
  genre?: string;
  year?: number;
  season?: AnimeSeason;
  status?: AnimeStatus;
  format?: AnimeFormat;
  sort?: AnimeSortMode;
  page?: number;
  perPage?: number;
}

/**
 * One error type for every source, so the routes map a failure to an HTTP
 * status without knowing who failed. `status` is what the client should see,
 * not necessarily what the upstream returned: a source being down is a 503 to
 * our caller even when the upstream phrased it as a 504.
 */
export class AnimeSourceError extends Error {
  readonly status: number;
  readonly source: AnimeSourceId;

  constructor(message: string, status: number, source: AnimeSourceId) {
    super(message);
    this.name = "AnimeSourceError";
    this.status = status;
    this.source = source;
  }
}

/**
 * The contract every catalogue implements.
 *
 * Deliberately narrow: three reads, all returning the app's own shapes. A
 * source that cannot express a filter answers as closely as it can rather than
 * throwing — a slightly wider result set beats an empty page.
 */
export interface AnimeSource {
  readonly id: AnimeSourceId;
  search(query: AnimeQuery): Promise<AnimeSearchResponse>;
  getDetails(id: number): Promise<AnimeDetails | null>;
  getGenres(): Promise<string[]>;
}
