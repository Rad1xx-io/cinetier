import type { RankedTitle, Tier } from "@/lib/types";
import { battleItemId } from "@/lib/battle/pool";
import { posterUrl } from "@/lib/utils/tmdb-image";
import type { VotingCategory, VotingPoolItem } from "@/lib/types/voting";

/** Same bounds as Battle's own pool (`lib/battle/pool.ts`), for the same reason: too few is not a vote worth having, too many is not one screen at a time. */
export const MIN_POOL_SIZE = 3;
export const DEFAULT_POOL_SIZE = 20;
export const MAX_POOL_SIZE = 50;

/** `lib/battle/pool.ts` has the identical check but keeps it module-private — small enough, and useful enough on its own, to have its own copy rather than exporting a function from a file named for a different feature. */
export function isRatedTier(tier: string): tier is Tier {
  return tier !== "Unrated";
}

/**
 * Freezes a chosen slice of the creator's own board into a session's pool.
 *
 * `itemKey` reuses `battleItemId` rather than a new key builder — the exact
 * identity this app already fixed twice (migrations 031, 032) for the same
 * shape of collision, not a third implementation of it. `posterPath` is
 * resolved to an absolute url now, at freeze time, for the reason
 * `battles.items` already does the same (migration 006's own comment): the
 * session can outlive the board it was built from.
 */
export function buildVotingPool(titles: RankedTitle[]): VotingPoolItem[] {
  return titles.map((title) => ({
    itemKey: battleItemId(title),
    tmdbId: title.tmdbId,
    mediaType: title.mediaType,
    title: title.title,
    posterPath: posterUrl(title.posterPath),
    releaseDate: title.releaseDate,
    ...(title.mediaType === "game" && title.gameSource ? { gameSource: title.gameSource } : {}),
    ...(title.mediaType === "anime" && title.animeSource ? { animeSource: title.animeSource } : {}),
  }));
}

/** The category a pool implies: its one media type, or "mixed" once it spans more than one — the same choice a regular post's own category already makes, just derived instead of asked for a second time. */
export function categoryForPool(pool: VotingPoolItem[]): VotingCategory {
  const mediaTypes = new Set(pool.map((item) => item.mediaType));
  if (mediaTypes.size === 1) return [...mediaTypes][0] as VotingCategory;
  return "mixed";
}
