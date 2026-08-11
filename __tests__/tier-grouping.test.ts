import { describe, expect, it } from "vitest";
import {
  filterAndSortTierItems,
  groupByTier,
  resolveContainer,
  tierItemKey,
} from "@/lib/utils/tier-grouping";
import type { RankedTitle } from "@/lib/types";

function makeTitle(overrides: Partial<RankedTitle> = {}): RankedTitle {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "Матрица",
    posterPath: null,
    releaseDate: "1999-03-30",
    tier: "Unrated",
    order: 0,
    addedAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("tierItemKey", () => {
  it("combines mediaType and tmdbId", () => {
    expect(tierItemKey(makeTitle({ tmdbId: 42, mediaType: "tv" }))).toBe("tv-42");
  });
});

describe("groupByTier", () => {
  it("buckets titles by tier and sorts each bucket by manual order", () => {
    const titles = [
      makeTitle({ tmdbId: 1, tier: "S", order: 1 }),
      makeTitle({ tmdbId: 2, tier: "S", order: 0 }),
      makeTitle({ tmdbId: 3, tier: "Unrated", order: 0 }),
    ];
    const grouped = groupByTier(titles);
    expect(grouped.S.map((t) => t.tmdbId)).toEqual([2, 1]);
    expect(grouped.Unrated.map((t) => t.tmdbId)).toEqual([3]);
    expect(grouped.A).toEqual([]);
  });

  it("returns every tier bucket even when empty", () => {
    const grouped = groupByTier([]);
    expect(Object.keys(grouped).sort()).toEqual(
      ["A", "B", "C", "D", "F", "S", "Unrated"].sort()
    );
  });
});

describe("resolveContainer", () => {
  const containers = groupByTier([
    makeTitle({ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }),
    makeTitle({ tmdbId: 2, mediaType: "movie", tier: "Unrated", order: 0 }),
  ]);

  it("resolves an item id to the tier that owns it", () => {
    expect(resolveContainer(containers, "movie-1")).toBe("S");
    expect(resolveContainer(containers, "movie-2")).toBe("Unrated");
  });

  it("resolves a tier id to itself, even when that tier is empty (drop on empty tier)", () => {
    expect(resolveContainer(containers, "A")).toBe("A");
    expect(resolveContainer(containers, "Unrated")).toBe("Unrated");
  });

  it("returns undefined for an id that matches nothing", () => {
    expect(resolveContainer(containers, "movie-999")).toBeUndefined();
  });

  it("always reflects the exact snapshot passed in, never a stale one", () => {
    // Simulates the drag bug scenario: resolve against a snapshot where the
    // item has already been optimistically moved by a prior onDragOver update.
    const afterOptimisticMove = groupByTier([
      makeTitle({ tmdbId: 1, mediaType: "movie", tier: "A", order: 0 }),
      makeTitle({ tmdbId: 2, mediaType: "movie", tier: "Unrated", order: 0 }),
    ]);
    expect(resolveContainer(containers, "movie-1")).toBe("S");
    expect(resolveContainer(afterOptimisticMove, "movie-1")).toBe("A");
  });
});

describe("filterAndSortTierItems", () => {
  const items = [
    makeTitle({ tmdbId: 1, title: "Интерстеллар", mediaType: "movie", addedAt: 100, releaseDate: "2014-11-06", voteAverage: 8.4, order: 2 }),
    makeTitle({ tmdbId: 2, title: "Крид", mediaType: "movie", addedAt: 300, releaseDate: "2015-11-25", voteAverage: 7.1, order: 0 }),
    makeTitle({ tmdbId: 3, title: "Воин", mediaType: "tv", addedAt: 200, releaseDate: "2011-09-09", voteAverage: 7.9, order: 1 }),
  ];

  it("returns items unchanged for manual sort with no filters", () => {
    const result = filterAndSortTierItems(items, { search: "", mediaFilter: "all", sort: "manual" });
    expect(result.map((t) => t.tmdbId)).toEqual([1, 2, 3]);
  });

  it("filters by media type", () => {
    const result = filterAndSortTierItems(items, { search: "", mediaFilter: "tv", sort: "manual" });
    expect(result.map((t) => t.tmdbId)).toEqual([3]);
  });

  it("filters by case-insensitive title search", () => {
    const result = filterAndSortTierItems(items, { search: "крид", mediaFilter: "all", sort: "manual" });
    expect(result.map((t) => t.tmdbId)).toEqual([2]);
  });

  it("sorts by title A-Z", () => {
    const result = filterAndSortTierItems(items, { search: "", mediaFilter: "all", sort: "title" });
    expect(result.map((t) => t.title)).toEqual(["Воин", "Интерстеллар", "Крид"]);
  });

  it("sorts by newest added first", () => {
    const result = filterAndSortTierItems(items, { search: "", mediaFilter: "all", sort: "newest" });
    expect(result.map((t) => t.tmdbId)).toEqual([2, 3, 1]);
  });

  it("sorts by release year, newest first", () => {
    const result = filterAndSortTierItems(items, { search: "", mediaFilter: "all", sort: "year" });
    expect(result.map((t) => t.tmdbId)).toEqual([2, 1, 3]);
  });

  it("sorts by TMDB rating, highest first, treating missing rating as lowest", () => {
    const noRating = makeTitle({ tmdbId: 4, title: "Без рейтинга", voteAverage: undefined, order: 3 });
    const result = filterAndSortTierItems([...items, noRating], {
      search: "",
      mediaFilter: "all",
      sort: "rating",
    });
    expect(result.map((t) => t.tmdbId)).toEqual([1, 3, 2, 4]);
  });

  it("does not mutate the input array", () => {
    const copy = [...items];
    filterAndSortTierItems(items, { search: "", mediaFilter: "all", sort: "title" });
    expect(items).toEqual(copy);
  });
});
