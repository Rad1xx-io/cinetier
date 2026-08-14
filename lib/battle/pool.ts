import { TIERS, type MediaType, type RankedTitle, type Tier } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import { posterUrl } from "@/lib/utils/tmdb-image";
import type { BattleCategory, BattleItem } from "@/lib/types/battle";

/**
 * Five is the floor at which a percentage means anything — below that a single
 * disagreement swings the score by 20 points or more. Fifty is the ceiling the
 * creator may raise it to; twenty is where it starts, because the participant
 * rates every item by hand, one screen at a time, and twenty is already a
 * couple of minutes of tapping.
 */
export const MIN_POOL_SIZE = 5;
export const DEFAULT_POOL_SIZE = 20;
export const MAX_POOL_SIZE = 50;

/** Rank of each tier for sorting, S first. */
const TIER_RANK: Record<string, number> = Object.fromEntries(
  TIERS.map((tier, index) => [tier, index])
);

/**
 * One rated entry, flattened out of whichever store it came from.
 *
 * Titles and channels live in separate stores with different ids and different
 * artwork fields, but a battle treats them identically once they are on the
 * board. Converting both to this shape once, at the edge, keeps every step after
 * it from branching on which store an entry came from.
 */
export interface PoolCandidate {
  id: string;
  title: string;
  posterUrl?: string;
  category: BattleCategory;
  tier: Tier;
  order: number;
}

/**
 * Which battle category a ranked title belongs to.
 *
 * Films and series share one deliberately: they are ranked on the same board,
 * against each other, and splitting them would halve most people's pool for no
 * gain. Channels do not go through here — they are their own category and their
 * own store, with no `MediaType` to map from.
 */
export function battleCategoryOf(mediaType: MediaType): BattleCategory | null {
  switch (mediaType) {
    case "movie":
    case "tv":
      return "cinema";
    case "anime":
      return "anime";
    case "game":
      return "games";
    default:
      return null;
  }
}

/** The id a battle uses for a title — the same shape the analytics funnel uses. */
export function battleItemId(title: RankedTitle): string {
  return `${title.mediaType}-${title.tmdbId}`;
}

function isRatedTier(tier: string): tier is Tier {
  return Object.prototype.hasOwnProperty.call(TIER_RANK, tier);
}

/**
 * Flattens both stores into battle candidates.
 *
 * Unrated entries are dropped here rather than later: a battle compares the
 * creator's tiers against the participant's, and an entry the creator never
 * judged has nothing to compare against.
 */
export function toCandidates(
  titles: RankedTitle[],
  channels: RankedChannel[] = []
): PoolCandidate[] {
  const candidates: PoolCandidate[] = [];

  for (const title of titles) {
    const category = battleCategoryOf(title.mediaType);
    if (!category || !isRatedTier(title.tier)) continue;
    // Posters are resolved to absolute URLs here because the battle row outlives
    // the catalog it came from: a participant loading it a year later has no way
    // to know which source a bare path belonged to.
    const poster = posterUrl(title.posterPath);
    candidates.push({
      id: battleItemId(title),
      title: title.title,
      category,
      tier: title.tier,
      order: title.order,
      ...(poster ? { posterUrl: poster } : {}),
    });
  }

  for (const channel of channels) {
    if (!isRatedTier(channel.tier)) continue;
    candidates.push({
      id: `youtube-${channel.channelId}`,
      title: channel.title,
      category: "youtube",
      tier: channel.tier,
      order: channel.order,
      ...(channel.thumbnailUrl ? { posterUrl: channel.thumbnailUrl } : {}),
    });
  }

  return candidates;
}

export interface PoolOptions {
  /** How many entries to keep. Clamped to [MIN_POOL_SIZE, MAX_POOL_SIZE]. */
  limit?: number;
  /**
   * Which tiers may take part. Omitted means all of them — a battle over D and F
   * alone is a perfectly good format ("worst of"), so this is a plain filter
   * rather than a quality floor.
   */
  tiers?: readonly Tier[];
}

/** The candidates of one category, best first, filtered and capped. */
export function buildBattlePool(
  candidates: PoolCandidate[],
  category: BattleCategory,
  options: PoolOptions = {}
): PoolCandidate[] {
  const limit = clampPoolSize(options.limit ?? DEFAULT_POOL_SIZE);
  const allowed = options.tiers && options.tiers.length > 0 ? new Set(options.tiers) : null;

  return candidates
    .filter(
      (candidate) =>
        candidate.category === category && (!allowed || allowed.has(candidate.tier))
    )
    .sort(
      (a, b) =>
        TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
        a.order - b.order ||
        a.title.localeCompare(b.title)
    )
    .slice(0, limit);
}

/** Keeps a hand-typed number inside the range a battle can actually be played at. */
export function clampPoolSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POOL_SIZE;
  return Math.min(MAX_POOL_SIZE, Math.max(MIN_POOL_SIZE, Math.round(value)));
}

/** How many entries each tier could contribute within one category. */
export function tierCounts(
  candidates: PoolCandidate[],
  category: BattleCategory
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    if (candidate.category !== category) continue;
    counts[candidate.tier] = (counts[candidate.tier] ?? 0) + 1;
  }
  return counts;
}

/** How many rated entries each category could contribute, for the picker. */
export function poolSizes(candidates: PoolCandidate[]): Record<BattleCategory, number> {
  const sizes: Record<BattleCategory, number> = { cinema: 0, anime: 0, games: 0, youtube: 0 };
  for (const candidate of candidates) sizes[candidate.category] += 1;
  return sizes;
}

/** The category with the most rated entries — the one worth opening on. */
export function bestCategory(candidates: PoolCandidate[]): BattleCategory {
  const sizes = poolSizes(candidates);
  return (Object.keys(sizes) as BattleCategory[]).reduce((best, category) =>
    sizes[category] > sizes[best] ? category : best
  );
}

/** Freezes candidates into the snapshot a battle stores. */
export function toBattleItems(candidates: PoolCandidate[]): BattleItem[] {
  return candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    ...(candidate.posterUrl ? { posterUrl: candidate.posterUrl } : {}),
  }));
}

/** The creator's side of the comparison: item id -> tier. */
export function toCreatorRatings(candidates: PoolCandidate[]): Record<string, string> {
  const ratings: Record<string, string> = {};
  for (const candidate of candidates) ratings[candidate.id] = candidate.tier;
  return ratings;
}
