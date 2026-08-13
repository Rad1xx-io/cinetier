import "server-only";
import { steamFetch } from "@/lib/steam/client";
import { mapAppToDetails, mapAppToSummary } from "@/lib/steam/mappers";
import { expandQueryVariants } from "@/lib/games/query-variants";
import type { GameCategory, GameGenre, GamePlatform, GameSort } from "@/lib/steam/filters";
import type { SteamAppDetailsResponse } from "@/lib/steam/types";
import type { GameDetails, GameSummary } from "@/lib/types/game";

const STORE = "https://store.steampowered.com";

/** Games requested per page. Each one costs an appdetails call, so this is the main lever on both latency and Steam's per-IP rate limit. */
export const GAMES_PAGE_SIZE = 36;

/** appdetails is one request per app; running them all at once spikes Steam and gains nothing, so they go out in waves. */
const ENRICH_BATCH_SIZE = 9;

/** Steam's storefront "type" facet; 998 is games, which keeps DLC, soundtracks and hardware out of the candidate list. */
const GAMES_ONLY = "998";

async function fetchApp(appId: number): Promise<GameSummary | null> {
  try {
    const data = await steamFetch<SteamAppDetailsResponse>(
      `${STORE}/api/appdetails?appids=${appId}&l=russian`
    );
    const entry = data?.[String(appId)];
    if (!entry?.success || !entry.data) return null;
    if (entry.data.type !== "game") return null;
    return mapAppToSummary(entry.data);
  } catch {
    return null;
  }
}

/**
 * Enriches ids in batches: parallel inside a batch, sequential between them.
 * Anything that fails or turns out not to be a game is dropped; input order is
 * preserved so Steam's own ranking survives.
 */
async function enrichAppIds(appIds: number[]): Promise<GameSummary[]> {
  const games: GameSummary[] = [];
  for (let i = 0; i < appIds.length; i += ENRICH_BATCH_SIZE) {
    const batch = appIds.slice(i, i + ENRICH_BATCH_SIZE);
    const settled = await Promise.all(batch.map(fetchApp));
    for (const game of settled) {
      if (game) games.push(game);
    }
  }
  return games;
}

export interface DiscoverGamesParams {
  query?: string;
  genre?: GameGenre;
  platform?: GamePlatform;
  category?: GameCategory;
  sort?: GameSort;
  /** 0-based. */
  page?: number;
}

export interface DiscoverGamesResult {
  results: GameSummary[];
  hasMore: boolean;
  /** Served from the last good answer because the store was unreachable. */
  stale?: boolean;
}

function buildSearchParams(params: DiscoverGamesParams, term: string | undefined, start: number) {
  const sp = new URLSearchParams({
    json: "1",
    infinite: "1",
    l: "russian",
    category1: GAMES_ONLY,
    start: String(start),
    count: String(GAMES_PAGE_SIZE),
  });
  if (term) sp.set("term", term);
  if (params.genre) sp.set("genre", params.genre);
  if (params.platform) sp.set("os", params.platform);
  if (params.category) sp.set("category2", params.category);

  // Metacritic is not a Steam sort key, so that one is applied after enrichment.
  if (params.sort === "released") sp.set("sort_by", "Released_DESC");
  else if (params.sort === "name") sp.set("sort_by", "Name_ASC");
  else if (!term) {
    // Browsing has no relevance signal, so fall back to the most-reviewed.
    sp.set("sort_by", "Reviews_DESC");
  }
  // Searching deliberately sends no sort_by: Steam's default ordering is
  // relevance-weighted, and forcing Reviews_DESC discards the match quality
  // entirely — "dota 2" then returns The Lab and Element TD ahead of Dota 2.

  return sp;
}

interface SearchPage {
  ids: number[];
  totalCount: number;
}

/**
 * Steam's own storefront search — the only endpoint that filters the whole
 * catalog by genre, platform and feature. `json=1&infinite=1` returns a slice
 * of the store grid; we read nothing from it but the app ids
 * (`data-ds-appid`) and take every displayed field from appdetails, so a
 * markup change can only cost us results, never corrupt them.
 */
async function fetchSearchPage(
  params: DiscoverGamesParams,
  term: string | undefined,
  start: number
): Promise<SearchPage> {
  const data = await steamFetch<{ results_html?: string; total_count?: number }>(
    `${STORE}/search/results/?${buildSearchParams(params, term, start).toString()}`,
    300
  );

  const html = data?.results_html ?? "";
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const match of html.matchAll(/data-ds-appid="(\d+)"/g)) {
    const id = Number(match[1]);
    if (Number.isFinite(id) && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { ids, totalCount: data?.total_count ?? 0 };
}

/**
 * Runs every query variant (see query-variants) in parallel and merges the ids.
 *
 * Which variant deserves the top slot depends on the query: "ведьмак" is a real
 * Steam title and its own results are the good ones, while "дота 2" matches
 * almost nothing and only "dota 2" finds the game. Steam's own `total_count` is
 * the tiebreaker — the variant it understood best leads, and the rest are
 * round-robined in behind it so their unique hits still surface near the top
 * instead of being buried a page down.
 */
async function collectAppIds(params: DiscoverGamesParams, start: number): Promise<SearchPage> {
  const terms = params.query ? expandQueryVariants(params.query) : [undefined];
  const pages = await Promise.all(terms.map((term) => fetchSearchPage(params, term, start)));
  const ranked = [...pages].sort((a, b) => b.totalCount - a.totalCount);

  const seen = new Set<number>();
  const ids: number[] = [];
  const longest = Math.max(0, ...ranked.map((p) => p.ids.length));
  for (let rank = 0; rank < longest; rank++) {
    for (const page of ranked) {
      const id = page.ids[rank];
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }

  return { ids, totalCount: Math.max(...pages.map((p) => p.totalCount), 0) };
}

function sortGames(games: GameSummary[], sort: GameSort | undefined): GameSummary[] {
  // Steam already ordered the other modes; only Metacritic has no store-side
  // equivalent, so it reorders the enriched page (games without a score last).
  if (sort !== "metacritic") return games;
  return [...games].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/**
 * Last good answer per query, kept in memory so a temporary upstream failure
 * degrades to slightly stale results instead of an empty page.
 *
 * Steam throttles by IP and answers an over-budget caller with a blanket 403 on
 * every endpoint, which is exactly when the page is least able to recover on
 * its own. Entries are never evicted by age on purpose: stale games are still
 * useful, and the map is bounded by the number of distinct filter combinations
 * a session actually visits.
 */
const lastGoodResults = new Map<string, DiscoverGamesResult>();
const MAX_CACHED_QUERIES = 60;

function cacheKey(params: DiscoverGamesParams): string {
  return JSON.stringify([
    params.query ?? "",
    params.genre ?? "",
    params.platform ?? "",
    params.category ?? "",
    params.sort ?? "popularity",
    params.page ?? 0,
  ]);
}

export async function discoverGames(params: DiscoverGamesParams): Promise<DiscoverGamesResult> {
  const page = Math.max(0, params.page ?? 0);
  const start = page * GAMES_PAGE_SIZE;
  const key = cacheKey(params);

  try {
    const { ids, totalCount } = await collectAppIds(params, start);
    const games = await enrichAppIds(ids.slice(0, GAMES_PAGE_SIZE));

    const result: DiscoverGamesResult = {
      results: sortGames(games, params.sort),
      // Trust the store's own count where it has one; otherwise infer from a full slice.
      hasMore: totalCount > 0 ? start + GAMES_PAGE_SIZE < totalCount : ids.length >= GAMES_PAGE_SIZE,
    };

    // An empty page is a legitimate answer, but it is not worth remembering.
    if (result.results.length > 0) {
      if (lastGoodResults.size >= MAX_CACHED_QUERIES) {
        lastGoodResults.delete(lastGoodResults.keys().next().value as string);
      }
      lastGoodResults.set(key, result);
    }
    return result;
  } catch (error) {
    const cached = lastGoodResults.get(key);
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

export async function getGameDetails(appId: number): Promise<GameDetails | null> {
  const data = await steamFetch<SteamAppDetailsResponse>(
    `${STORE}/api/appdetails?appids=${appId}&l=russian`
  );
  const entry = data?.[String(appId)];
  if (!entry?.success || !entry.data) return null;
  return mapAppToDetails(entry.data);
}
