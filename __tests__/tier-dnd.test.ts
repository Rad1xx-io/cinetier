import { describe, expect, it } from "vitest";
import {
  applyDrop,
  findTier,
  flattenBuckets,
  moveItemToTier,
  reorderWithinTier,
} from "@/lib/utils/tier-dnd";
import { groupByTier, tierItemKey } from "@/lib/utils/tier-grouping";
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

/** S: [movie-1, movie-2], Unrated: [movie-3], everything else empty. */
function board() {
  return groupByTier([
    makeTitle({ tmdbId: 1, tier: "S", order: 0 }),
    makeTitle({ tmdbId: 2, tier: "S", order: 1 }),
    makeTitle({ tmdbId: 3, tier: "Unrated", order: 0 }),
  ]);
}

describe("findTier", () => {
  it("resolves an item id to its owning tier", () => {
    expect(findTier(board(), "movie-1", tierItemKey)).toBe("S");
    expect(findTier(board(), "movie-3", tierItemKey)).toBe("Unrated");
  });

  it("resolves a tier id to itself, including empty tiers", () => {
    expect(findTier(board(), "B", tierItemKey)).toBe("B");
  });

  it("returns undefined for an unknown id", () => {
    expect(findTier(board(), "movie-999", tierItemKey)).toBeUndefined();
  });
});

describe("moveItemToTier", () => {
  it("moves a card into an empty tier dropped on the row itself", () => {
    const next = moveItemToTier(board(), "movie-1", "B", tierItemKey);
    expect(next.B.map(tierItemKey)).toEqual(["movie-1"]);
    expect(next.S.map(tierItemKey)).toEqual(["movie-2"]);
  });

  it("rewrites the moved card's tier field so persistence agrees with position", () => {
    const next = moveItemToTier(board(), "movie-1", "B", tierItemKey);
    expect(next.B[0].tier).toBe("B");
  });

  it("inserts at the hovered card's index rather than always appending", () => {
    const next = moveItemToTier(board(), "movie-3", "movie-1", tierItemKey);
    expect(next.S.map(tierItemKey)).toEqual(["movie-3", "movie-1", "movie-2"]);
    expect(next.Unrated).toEqual([]);
  });

  it("moves a card out of Unrated", () => {
    const next = moveItemToTier(board(), "movie-3", "A", tierItemKey);
    expect(next.A.map(tierItemKey)).toEqual(["movie-3"]);
    expect(next.Unrated).toEqual([]);
  });

  it("moves a card back into Unrated from a rated tier", () => {
    const next = moveItemToTier(board(), "movie-1", "Unrated", tierItemKey);
    expect(next.Unrated.map(tierItemKey)).toEqual(["movie-3", "movie-1"]);
    expect(next.Unrated[1].tier).toBe("Unrated");
  });

  it("returns the same object when the drop stays inside one tier", () => {
    const before = board();
    expect(moveItemToTier(before, "movie-1", "movie-2", tierItemKey)).toBe(before);
  });

  it("returns the same object for an unknown id", () => {
    const before = board();
    expect(moveItemToTier(before, "movie-999", "B", tierItemKey)).toBe(before);
  });

  it("does not mutate the input", () => {
    const before = board();
    const snapshot = JSON.parse(JSON.stringify(before));
    moveItemToTier(before, "movie-1", "B", tierItemKey);
    expect(before).toEqual(snapshot);
  });

  it("reaches every tier, not just the ones near the top of the board", () => {
    for (const tier of ["S", "A", "B", "C", "D", "F", "Unrated"] as const) {
      const next = moveItemToTier(board(), "movie-3", tier, tierItemKey);
      expect(next[tier].some((t) => tierItemKey(t) === "movie-3")).toBe(true);
      expect(next[tier].find((t) => tierItemKey(t) === "movie-3")!.tier).toBe(tier);
    }
  });
});

describe("reorderWithinTier", () => {
  it("reorders two cards in the same tier", () => {
    const next = reorderWithinTier(board(), "movie-2", "movie-1", tierItemKey);
    expect(next.S.map(tierItemKey)).toEqual(["movie-2", "movie-1"]);
  });

  it("returns the same object when the card lands on itself", () => {
    const before = board();
    expect(reorderWithinTier(before, "movie-1", "movie-1", tierItemKey)).toBe(before);
  });

  it("returns the same object when the target is a tier rather than a card", () => {
    const before = board();
    expect(reorderWithinTier(before, "movie-1", "S", tierItemKey)).toBe(before);
  });
});

/**
 * The board is filtered by media tab, but drops are resolved against the full
 * list by item id — a card hidden by the active tab must keep its place and
 * its tier. Regression: dragging used to be disabled outright on any tab other
 * than "Все".
 */
describe("dropping while a media tab hides part of the board", () => {
  /** S: [movie-1, tv-2, anime-3, game-5] — the "Фильмы" tab shows only movie-1. */
  function mixedBoard() {
    return groupByTier([
      makeTitle({ tmdbId: 1, mediaType: "movie", tier: "S", order: 0 }),
      makeTitle({ tmdbId: 2, mediaType: "tv", tier: "S", order: 1 }),
      makeTitle({ tmdbId: 3, mediaType: "anime", tier: "S", order: 2 }),
      makeTitle({ tmdbId: 5, mediaType: "game", tier: "S", order: 3 }),
      makeTitle({ tmdbId: 4, mediaType: "movie", tier: "Unrated", order: 0 }),
    ]);
  }

  it("moves a game across tiers, leaving the other categories untouched", () => {
    const next = moveItemToTier(mixedBoard(), "game-5", "B", tierItemKey);
    expect(next.B.map(tierItemKey)).toEqual(["game-5"]);
    expect(next.B[0].tier).toBe("B");
    expect(next.S.map(tierItemKey)).toEqual(["movie-1", "tv-2", "anime-3"]);
  });

  it("keeps a game's id namespaced apart from a film sharing the same numeric id", () => {
    const board = groupByTier([
      makeTitle({ tmdbId: 292030, mediaType: "movie", tier: "S", order: 0 }),
      makeTitle({ tmdbId: 292030, mediaType: "game", tier: "Unrated", order: 0 }),
    ]);
    const next = moveItemToTier(board, "game-292030", "A", tierItemKey);
    expect(next.A.map(tierItemKey)).toEqual(["game-292030"]);
    expect(next.S.map(tierItemKey)).toEqual(["movie-292030"]);
  });

  it("moves a card across tiers without disturbing cards the filter hides", () => {
    const next = moveItemToTier(mixedBoard(), "movie-4", "A", tierItemKey);
    expect(next.A.map(tierItemKey)).toEqual(["movie-4"]);
    expect(next.S.map(tierItemKey)).toEqual(["movie-1", "tv-2", "anime-3", "game-5"]);
  });

  it("inserts at the hovered card's position in the full list, not the visible one", () => {
    // On the "Фильмы" tab movie-1 is the only visible card in S, so dropping
    // movie-4 onto it must land at movie-1's real index, keeping the hidden
    // tv/anime/game cards after it.
    const next = moveItemToTier(mixedBoard(), "movie-4", "movie-1", tierItemKey);
    expect(next.S.map(tierItemKey)).toEqual([
      "movie-4",
      "movie-1",
      "tv-2",
      "anime-3",
      "game-5",
    ]);
  });

  it("keeps hidden cards' tier and relative order after flattening", () => {
    const moved = moveItemToTier(mixedBoard(), "movie-4", "movie-1", tierItemKey);
    const flat = flattenBuckets<RankedTitle>(moved, (t, index) => ({ ...t, order: index }));
    const hidden = flat.filter((t) => t.mediaType !== "movie");
    expect(hidden.map((t) => `${tierItemKey(t)}:${t.tier}:${t.order}`)).toEqual([
      "tv-2:S:2",
      "anime-3:S:3",
      "game-5:S:4",
    ]);
  });
});

describe("applyDrop", () => {
  it("performs the cross-tier move when onDragOver never ran (fast flick)", () => {
    const next = applyDrop(board(), "movie-3", "D", tierItemKey);
    expect(next.D.map(tierItemKey)).toEqual(["movie-3"]);
    expect(next.Unrated).toEqual([]);
  });

  it("is idempotent once onDragOver already applied the move", () => {
    const afterPreview = moveItemToTier(board(), "movie-3", "D", tierItemKey);
    const afterDrop = applyDrop(afterPreview, "movie-3", "D", tierItemKey);
    expect(afterDrop.D.map(tierItemKey)).toEqual(["movie-3"]);
    expect(afterDrop.Unrated).toEqual([]);
  });

  it("falls through to a reorder when both ids share a tier", () => {
    const next = applyDrop(board(), "movie-2", "movie-1", tierItemKey);
    expect(next.S.map(tierItemKey)).toEqual(["movie-2", "movie-1"]);
  });
});

describe("flattenBuckets", () => {
  it("renumbers order per tier and preserves tier assignment", () => {
    const moved = moveItemToTier(board(), "movie-3", "movie-1", tierItemKey);
    const flat = flattenBuckets<RankedTitle>(moved, (t, index) => ({ ...t, order: index }));

    const s = flat.filter((t) => t.tier === "S");
    expect(s.map((t) => `${tierItemKey(t)}:${t.order}`)).toEqual([
      "movie-3:0",
      "movie-1:1",
      "movie-2:2",
    ]);
    expect(flat).toHaveLength(3);
  });

  it("stamps only the card that moved", () => {
    const flat = flattenBuckets<RankedTitle>(board(), (t, index) => ({
      ...t,
      order: index,
      updatedAt: tierItemKey(t) === "movie-1" ? 9999 : t.updatedAt,
    }));
    expect(flat.find((t) => tierItemKey(t) === "movie-1")!.updatedAt).toBe(9999);
    expect(flat.find((t) => tierItemKey(t) === "movie-2")!.updatedAt).toBe(1000);
  });
});
