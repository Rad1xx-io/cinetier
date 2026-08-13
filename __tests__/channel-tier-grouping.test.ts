import { describe, expect, it } from "vitest";
import {
  channelItemKey,
  filterAndSortChannelItems,
  groupChannelsByTier,
  resolveChannelContainer,
} from "@/lib/utils/channel-tier-grouping";
import type { RankedChannel } from "@/lib/types/youtube";

function makeChannel(overrides: Partial<RankedChannel> = {}): RankedChannel {
  return {
    channelId: "UC1",
    title: "Тестовый канал",
    thumbnailUrl: null,
    country: "RU",
    tier: "Unrated",
    order: 0,
    addedAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("channelItemKey", () => {
  it("returns the channelId", () => {
    expect(channelItemKey(makeChannel({ channelId: "UCabc" }))).toBe("UCabc");
  });
});

describe("groupChannelsByTier", () => {
  it("buckets channels by tier and sorts each bucket by manual order", () => {
    const channels = [
      makeChannel({ channelId: "UC1", tier: "S", order: 1 }),
      makeChannel({ channelId: "UC2", tier: "S", order: 0 }),
      makeChannel({ channelId: "UC3", tier: "Unrated", order: 0 }),
    ];
    const grouped = groupChannelsByTier(channels);
    expect(grouped.S.map((c) => c.channelId)).toEqual(["UC2", "UC1"]);
    expect(grouped.Unrated.map((c) => c.channelId)).toEqual(["UC3"]);
    expect(grouped.A).toEqual([]);
  });
});

describe("resolveChannelContainer", () => {
  const containers = groupChannelsByTier([
    makeChannel({ channelId: "UC1", tier: "S" }),
    makeChannel({ channelId: "UC2", tier: "Unrated" }),
  ]);

  it("resolves a channel id to its owning tier", () => {
    expect(resolveChannelContainer(containers, "UC1")).toBe("S");
    expect(resolveChannelContainer(containers, "UC2")).toBe("Unrated");
  });

  it("resolves a tier id to itself, even when empty", () => {
    expect(resolveChannelContainer(containers, "F")).toBe("F");
  });

  it("returns undefined for an unknown id", () => {
    expect(resolveChannelContainer(containers, "UC-missing")).toBeUndefined();
  });
});

describe("filterAndSortChannelItems", () => {
  const items = [
    makeChannel({ channelId: "UC1", title: "Крутой канал", addedAt: 100, subscriberCount: 5000, order: 1 }),
    makeChannel({ channelId: "UC2", title: "Авторский блог", addedAt: 300, subscriberCount: 900000, order: 0 }),
    makeChannel({ channelId: "UC3", title: "Летсплеи", addedAt: 200, subscriberCount: 12000, order: 2 }),
  ];

  it("returns items unchanged for manual sort with no search", () => {
    const result = filterAndSortChannelItems(items, { search: "", sort: "manual" });
    expect(result.map((c) => c.channelId)).toEqual(["UC1", "UC2", "UC3"]);
  });

  it("filters by case-insensitive title search", () => {
    const result = filterAndSortChannelItems(items, { search: "летс", sort: "manual" });
    expect(result.map((c) => c.channelId)).toEqual(["UC3"]);
  });

  it("sorts by title A-Z", () => {
    const result = filterAndSortChannelItems(items, { search: "", sort: "title" });
    expect(result.map((c) => c.title)).toEqual(["Авторский блог", "Крутой канал", "Летсплеи"]);
  });

  it("sorts by newest added first", () => {
    const result = filterAndSortChannelItems(items, { search: "", sort: "newest" });
    expect(result.map((c) => c.channelId)).toEqual(["UC2", "UC3", "UC1"]);
  });

  it("sorts by subscriber count, highest first", () => {
    const result = filterAndSortChannelItems(items, { search: "", sort: "subscribers" });
    expect(result.map((c) => c.channelId)).toEqual(["UC2", "UC3", "UC1"]);
  });
});
