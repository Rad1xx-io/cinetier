import "server-only";
import { appStoreFetch } from "@/lib/app-store/client";
import { mapITunesToDetails, mapITunesToSummary } from "@/lib/app-store/mappers";
import type { ITunesSearchResponse } from "@/lib/app-store/types";
import type { MobileGameDetails, MobileGameSummary } from "@/lib/types/mobile-game";

const SEARCH_URL = "https://itunes.apple.com/search";
const LOOKUP_URL = "https://itunes.apple.com/lookup";
export const MOBILE_GAMES_PAGE_SIZE = 25;

export interface DiscoverMobileGamesParams {
  query: string;
  page?: number;
}

export interface DiscoverMobileGamesResult {
  results: MobileGameSummary[];
  hasMore: boolean;
}

/**
 * iTunes Search requires an actual term — there is no "browse everything"
 * endpoint the way Steam/IGDB's storefront search doubles as one. So unlike
 * /games/pc, this catalogue has no default popularity listing to render
 * before a visitor types anything; the page starts on a prompt instead.
 *
 * `offset` is not part of iTunes Search's documented contract the way
 * `limit` is, but is honoured in practice — `hasMore` is inferred from
 * getting a full page back rather than trusted from any total the API does
 * not actually report.
 */
export async function discoverMobileGames({
  query,
  page = 0,
}: DiscoverMobileGamesParams): Promise<DiscoverMobileGamesResult> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], hasMore: false };

  const params = new URLSearchParams({
    term: trimmed,
    country: "us",
    media: "software",
    entity: "software",
    limit: String(MOBILE_GAMES_PAGE_SIZE),
    offset: String(page * MOBILE_GAMES_PAGE_SIZE),
  });

  const data = await appStoreFetch<ITunesSearchResponse>(`${SEARCH_URL}?${params}`);
  const results = data.results.map(mapITunesToSummary);
  return { results, hasMore: results.length >= MOBILE_GAMES_PAGE_SIZE };
}

export async function getMobileGameDetails(id: number): Promise<MobileGameDetails | null> {
  const params = new URLSearchParams({ id: String(id), country: "us" });
  const data = await appStoreFetch<ITunesSearchResponse>(`${LOOKUP_URL}?${params}`);
  const result = data.results[0];
  return result ? mapITunesToDetails(result) : null;
}
