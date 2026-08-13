import { TIER_ORDER } from "@/lib/types";
import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

export type ChannelTierContainers = Record<TierOrUnrated, RankedChannel[]>;

export function channelItemKey(c: RankedChannel): string {
  return c.channelId;
}

export function groupChannelsByTier(channels: RankedChannel[]): ChannelTierContainers {
  const base = Object.fromEntries(
    TIER_ORDER.map((tier) => [tier, [] as RankedChannel[]])
  ) as ChannelTierContainers;
  for (const c of channels) {
    base[c.tier]?.push(c);
  }
  for (const tier of TIER_ORDER) {
    base[tier].sort((a, b) => a.order - b.order);
  }
  return base;
}

/** Same staleness rationale as lib/utils/tier-grouping.ts:resolveContainer — always call against a fresh snapshot. */
export function resolveChannelContainer(
  containers: ChannelTierContainers,
  id: string
): TierOrUnrated | undefined {
  if ((TIER_ORDER as string[]).includes(id)) return id as TierOrUnrated;
  return TIER_ORDER.find((tier) => containers[tier].some((c) => channelItemKey(c) === id));
}

export type ChannelSortMode = "manual" | "title" | "newest" | "subscribers";

export interface ChannelFilterOptions {
  search: string;
  sort: ChannelSortMode;
}

export function filterAndSortChannelItems(
  items: RankedChannel[],
  { search, sort }: ChannelFilterOptions
): RankedChannel[] {
  let list = items;

  const query = search.trim().toLowerCase();
  if (query) {
    list = list.filter((c) => c.title.toLowerCase().includes(query));
  }

  switch (sort) {
    case "title":
      return [...list].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    case "newest":
      return [...list].sort((a, b) => b.addedAt - a.addedAt);
    case "subscribers":
      return [...list].sort((a, b) => (b.subscriberCount ?? -1) - (a.subscriberCount ?? -1));
    default:
      return list;
  }
}
