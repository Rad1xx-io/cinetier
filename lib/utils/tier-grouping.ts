import { TIER_ORDER } from "@/lib/types";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";

export type TierContainers = Record<TierOrUnrated, RankedTitle[]>;

export function tierItemKey(t: RankedTitle): string {
  return `${t.mediaType}-${t.tmdbId}`;
}

/**
 * Resolves a dnd-kit sortable/droppable id to the tier that currently owns it —
 * either the id is a tier itself (dropped on an empty tier's droppable region)
 * or it's an item key found inside one of the tier buckets.
 *
 * Must be called against a fresh `TierContainers` snapshot (e.g. the `prev`
 * argument of a `setState` updater), never a value captured in a render
 * closure — dnd-kit can fire onDragOver and onDragEnd back-to-back faster than
 * React commits a render in between, so resolving against stale state can
 * silently drop a cross-tier move.
 */
export function resolveContainer(containers: TierContainers, id: string): TierOrUnrated | undefined {
  if ((TIER_ORDER as string[]).includes(id)) return id as TierOrUnrated;
  return TIER_ORDER.find((tier) => containers[tier].some((t) => tierItemKey(t) === id));
}

/** Groups a flat list of ranked titles by tier, each bucket sorted by manual order. */
export function groupByTier(titles: RankedTitle[]): TierContainers {
  const base = Object.fromEntries(
    TIER_ORDER.map((tier) => [tier, [] as RankedTitle[]])
  ) as TierContainers;
  for (const t of titles) {
    base[t.tier]?.push(t);
  }
  for (const tier of TIER_ORDER) {
    base[tier].sort((a, b) => a.order - b.order);
  }
  return base;
}

export type MediaFilter = "all" | "movie" | "tv";
export type SortMode = "manual" | "title" | "newest" | "year" | "rating";

export interface TierFilterOptions {
  search: string;
  mediaFilter: MediaFilter;
  sort: SortMode;
}

/** Applies the tier list toolbar's search/media/sort to one tier's items. Pure — no storage access. */
export function filterAndSortTierItems(
  items: RankedTitle[],
  { search, mediaFilter, sort }: TierFilterOptions
): RankedTitle[] {
  let list = items;

  if (mediaFilter !== "all") {
    list = list.filter((t) => t.mediaType === mediaFilter);
  }

  const query = search.trim().toLowerCase();
  if (query) {
    list = list.filter((t) => t.title.toLowerCase().includes(query));
  }

  switch (sort) {
    case "title":
      return [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    case "newest":
      return [...list].sort((a, b) => b.addedAt - a.addedAt);
    case "year":
      return [...list].sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
    case "rating":
      return [...list].sort((a, b) => (b.voteAverage ?? -1) - (a.voteAverage ?? -1));
    default:
      return list;
  }
}
