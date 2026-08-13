import { TIER_ORDER } from "@/lib/types";
import type { RankedTitle, TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import type { CategoryFilter, ContentType } from "@/lib/utils/content-type";
import type { SortMode } from "@/lib/utils/tier-grouping";

/**
 * One row on the main board, whichever store it came from.
 *
 * Titles and channels stay in their own tables and their own local-storage
 * keys — a channel has no tmdbId and no mediaType, and merging the two schemas
 * would mean migrating live data. They are only unified here, at the point of
 * display, so the board can rank everything together while each store keeps
 * owning its own records.
 */
export type BoardItem =
  | { kind: "title"; tier: TierOrUnrated; order: number; title: RankedTitle }
  | { kind: "channel"; tier: TierOrUnrated; order: number; channel: RankedChannel };

/** dnd-kit ids must be unique across both kinds — a tmdbId and a channelId could otherwise collide. */
export function boardItemKey(item: BoardItem): string {
  return item.kind === "title"
    ? `title:${item.title.mediaType}-${item.title.tmdbId}`
    : `channel:${item.channel.channelId}`;
}

/** Channels have no mediaType, so "youtube" is derived from the kind itself. */
export function boardItemCategory(item: BoardItem): ContentType {
  return item.kind === "title" ? item.title.mediaType : "youtube";
}

export function boardItemTitle(item: BoardItem): string {
  return item.kind === "title" ? item.title.title : item.channel.title;
}

function addedAt(item: BoardItem): number {
  return item.kind === "title" ? item.title.addedAt : item.channel.addedAt;
}

export function toBoardItems(titles: RankedTitle[], channels: RankedChannel[]): BoardItem[] {
  return [
    ...titles.map((title): BoardItem => ({ kind: "title", tier: title.tier, order: title.order, title })),
    ...channels.map(
      (channel): BoardItem => ({ kind: "channel", tier: channel.tier, order: channel.order, channel })
    ),
  ];
}

/**
 * Splits a reordered board back into the two stores.
 *
 * The board renumbers `order` across both kinds within a tier, so each store
 * ends up with gaps in its sequence (0, 2, 5…). That is harmless: order is only
 * ever read as a sort key, and the gaps preserve the interleaved arrangement
 * the user actually dragged into place.
 */
export function splitBoardItems(items: BoardItem[]): {
  titles: RankedTitle[];
  channels: RankedChannel[];
} {
  const titles: RankedTitle[] = [];
  const channels: RankedChannel[] = [];

  for (const item of items) {
    if (item.kind === "title") {
      titles.push({ ...item.title, tier: item.tier, order: item.order });
    } else {
      channels.push({ ...item.channel, tier: item.tier, order: item.order });
    }
  }

  return { titles, channels };
}

export type BoardBuckets = Record<TierOrUnrated, BoardItem[]>;

/** Groups merged items by tier, each bucket in manual order. */
export function groupBoard(items: BoardItem[]): BoardBuckets {
  const base = Object.fromEntries(
    TIER_ORDER.map((tier) => [tier, [] as BoardItem[]])
  ) as BoardBuckets;

  for (const item of items) {
    base[item.tier]?.push(item);
  }
  for (const tier of TIER_ORDER) {
    base[tier].sort((a, b) => a.order - b.order);
  }
  return base;
}

export interface BoardFilterOptions {
  search: string;
  category: CategoryFilter;
  sort: SortMode;
}

export function filterAndSortBoardItems(
  items: BoardItem[],
  { search, category, sort }: BoardFilterOptions
): BoardItem[] {
  let list = items;

  if (category !== "all") {
    list = list.filter((item) => boardItemCategory(item) === category);
  }

  const query = search.trim().toLowerCase();
  if (query) {
    list = list.filter((item) => boardItemTitle(item).toLowerCase().includes(query));
  }

  switch (sort) {
    case "title":
      return [...list].sort((a, b) => boardItemTitle(a).localeCompare(boardItemTitle(b), "ru"));
    case "newest":
      return [...list].sort((a, b) => addedAt(b) - addedAt(a));
    case "year":
      // Channels have no release date; they sort after everything that does
      // rather than being silently treated as year zero.
      return [...list].sort((a, b) => releaseKey(b).localeCompare(releaseKey(a)));
    case "rating":
      return [...list].sort((a, b) => ratingKey(b) - ratingKey(a));
    default:
      return list;
  }
}

function releaseKey(item: BoardItem): string {
  return item.kind === "title" ? (item.title.releaseDate ?? "") : "";
}

function ratingKey(item: BoardItem): number {
  return item.kind === "title" ? (item.title.voteAverage ?? -1) : -1;
}
