import "server-only";
import { isIGDBConfigured } from "@/lib/igdb/client";
import * as igdb from "@/lib/igdb/discovery";
import * as steam from "@/lib/steam/discovery";
import type { GameDetails } from "@/lib/types/game";

export type GamesSource = "igdb" | "steam";

/**
 * Which catalog backs the games section.
 *
 * IGDB is the intended source: it covers the whole medium, including titles
 * Steam cannot serve at all — Minecraft was never sold there and Rocket League
 * left in 2020, both of which searched as junk against the store. Steam remains
 * wired up as the fallback so /games keeps working on a deployment that has no
 * Twitch credentials yet, rather than turning into an error page.
 */
export function activeGamesSource(): GamesSource {
  return isIGDBConfigured() || process.env.IGDB_ACCESS_TOKEN ? "igdb" : "steam";
}

export const GAMES_PAGE_SIZE = igdb.GAMES_PAGE_SIZE;

export type DiscoverGamesParams = igdb.DiscoverGamesParams;

export interface DiscoverGamesResult {
  results: igdb.DiscoverGamesResult["results"];
  hasMore: boolean;
  stale?: boolean;
  source: GamesSource;
}

export async function discoverGames(
  params: DiscoverGamesParams
): Promise<DiscoverGamesResult> {
  if (activeGamesSource() === "igdb") {
    const { results, hasMore } = await igdb.discoverGames(params);
    return { results, hasMore, source: "igdb" };
  }
  const { results, hasMore, stale } = await steam.discoverGames(params);
  return { results, hasMore, stale, source: "steam" };
}

/**
 * Resolves a game id against the active source, then against the other one.
 *
 * Ids saved into a tier list before the switch are Steam appids, and IGDB ids
 * are unrelated numbers — without this second lookup every previously ranked
 * game would 404 on its details page. The two id spaces do overlap numerically,
 * so a legacy entry can in principle resolve to a different IGDB game; that is
 * the trade for keeping existing lists openable.
 */
export async function getGameDetails(id: number): Promise<GameDetails | null> {
  const primary = activeGamesSource();

  if (primary === "igdb") {
    const fromIgdb = await igdb.getGameDetails(id).catch(() => null);
    if (fromIgdb) return fromIgdb;
    return steam.getGameDetails(id).catch(() => null);
  }

  return steam.getGameDetails(id);
}
