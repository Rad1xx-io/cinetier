import "server-only";
import type { AnimeDetails, AnimeSearchResponse, AnimeSummary } from "@/lib/types/anime";
import type { AnimeSortMode } from "@/lib/anilist/anime-filters";
import { searchWithFallback } from "@/lib/search/with-fallback";
import { jikanFetch } from "@/lib/anime-sources/jikan-client";
import { mapJikanToDetails, mapJikanToSummary } from "@/lib/anime-sources/jikan-adapter";
import type {
  JikanAnime,
  JikanGenreResponse,
  JikanListResponse,
  JikanSingleResponse,
} from "@/lib/anime-sources/jikan-types";
import type { AnimeQuery, AnimeSource } from "@/lib/anime-sources/anime-source";

/**
 * MyAnimeList ranks popularity, so 1 is the most popular title and the sort
 * runs ascending — the one entry here where the direction is not "more is
 * better".
 */
const SORT_MAP: Record<AnimeSortMode, { order_by: string; sort: "asc" | "desc" }> = {
  popularity: { order_by: "popularity", sort: "asc" },
  score: { order_by: "score", sort: "desc" },
  favourites: { order_by: "favorites", sort: "desc" },
  release_date: { order_by: "start_date", sort: "desc" },
  title: { order_by: "title", sort: "asc" },
};

/** AnimeStatus is richer than MyAnimeList's: cancelled and paused have no filter there. */
const STATUS_PARAM: Record<string, string> = {
  FINISHED: "complete",
  RELEASING: "airing",
  NOT_YET_RELEASED: "upcoming",
};

/** This is a personal media tracker, not an adult catalogue. */
const EXCLUDED_GENRES = new Set(["hentai", "erotica", "ecchi"]);

let genreIdCache: Map<string, number> | null = null;

async function genreIds(): Promise<Map<string, number>> {
  if (genreIdCache) return genreIdCache;
  const body = await jikanFetch<JikanGenreResponse>("/genres/anime", { revalidate: 86_400 });
  const map = new Map<string, number>();
  for (const entry of body?.data ?? []) {
    if (!EXCLUDED_GENRES.has(entry.name.toLowerCase())) map.set(entry.name.toLowerCase(), entry.mal_id);
  }
  genreIdCache = map;
  return map;
}

/** Test seam — the cache is module-level and would otherwise leak between cases. */
export function resetJikanGenreCache(): void {
  genreIdCache = null;
}

function withCommon(params: URLSearchParams, query: AnimeQuery): void {
  const { order_by, sort } = SORT_MAP[query.sort ?? "popularity"];
  params.set("order_by", order_by);
  params.set("sort", sort);
  params.set("limit", String(query.perPage ?? 24));
  params.set("page", String(query.page ?? 1));
  // Keeps adult entries out of listings the way AniList's genre filter did.
  params.set("sfw", "true");

  if (query.format) params.set("type", query.format.toLowerCase());
  if (query.status && STATUS_PARAM[query.status]) params.set("status", STATUS_PARAM[query.status]);
  // MyAnimeList filters by date range rather than by season year.
  if (query.year) {
    params.set("start_date", `${query.year}-01-01`);
    params.set("end_date", `${query.year}-12-31`);
  }
}

/**
 * The anime catalogue backed by MyAnimeList, through the Jikan proxy.
 *
 * Three filters do not translate cleanly and are handled rather than dropped:
 * genre arrives as a name and is looked up as a numeric id; a year becomes a
 * date range; and a season has no parameter on the search endpoint at all, so
 * it is applied to the mapped results instead. Each is noted where it happens.
 */
export const jikanSource: AnimeSource = {
  id: "jikan",

  async search(query: AnimeQuery): Promise<AnimeSearchResponse> {
    const term = query.query?.trim();
    const params = new URLSearchParams();
    withCommon(params, query);

    if (query.genre) {
      const id = (await genreIds()).get(query.genre.toLowerCase());
      // An unknown genre widens the search rather than emptying it: the filter
      // list and MyAnimeList's vocabulary can drift apart.
      if (id) params.set("genres", String(id));
    }

    let hasNextPage = false;

    async function fetchPage(search: string | undefined): Promise<JikanAnime[]> {
      const withSearch = new URLSearchParams(params);
      if (search) withSearch.set("q", search);
      const body = await jikanFetch<JikanListResponse>(`/anime?${withSearch.toString()}`);
      hasNextPage = hasNextPage || Boolean(body?.pagination?.has_next_page);
      return body?.data ?? [];
    }

    /**
     * Applied after mapping because `/anime` takes no season parameter. It
     * thins a page rather than paginating properly, which is the honest cost
     * of a filter the upstream does not offer.
     */
    function bySeason(items: AnimeSummary[]): AnimeSummary[] {
      return query.season ? items.filter((item) => item.season === query.season) : items;
    }

    if (!term) {
      const raw = await fetchPage(undefined);
      return { results: bySeason(raw.map(mapJikanToSummary)), hasNextPage, correctedQuery: null };
    }

    // Same fallback the other catalogues use: a Cyrillic or misspelled query
    // gets a second chance at a transliteration before giving up.
    const { results, correctedQuery } = await searchWithFallback(
      term,
      fetchPage,
      (item) => String(item.mal_id)
    );

    return { results: bySeason(results.map(mapJikanToSummary)), hasNextPage, correctedQuery };
  },

  async getDetails(id: number): Promise<AnimeDetails | null> {
    // `/full` rather than the plain endpoint: relations live only on that one,
    // and the details page has a section for them.
    const body = await jikanFetch<JikanSingleResponse>(`/anime/${id}/full`, {
      allowNotFound: true,
      revalidate: 3600,
    });
    return body?.data ? mapJikanToDetails(body.data) : null;
  },

  async getGenres(): Promise<string[]> {
    const body = await jikanFetch<JikanGenreResponse>("/genres/anime", { revalidate: 86_400 });
    return (body?.data ?? [])
      .map((entry) => entry.name)
      .filter((name) => !EXCLUDED_GENRES.has(name.toLowerCase()));
  },
};
