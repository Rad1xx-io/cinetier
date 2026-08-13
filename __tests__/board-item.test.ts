import { describe, expect, it } from "vitest";
import {
  boardItemCategory,
  boardItemKey,
  filterAndSortBoardItems,
  groupBoard,
  splitBoardItems,
  toBoardItems,
} from "@/lib/utils/board-item";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

const title = (over: Partial<RankedTitle> = {}): RankedTitle => ({
  tmdbId: 1,
  mediaType: "movie",
  title: "Фильм",
  posterPath: null,
  releaseDate: "2020-01-01",
  tier: "S",
  order: 0,
  addedAt: 100,
  updatedAt: 100,
  ...over,
});

const channel = (over: Partial<RankedChannel> = {}): RankedChannel => ({
  channelId: "UC1",
  title: "Канал",
  thumbnailUrl: null,
  country: "RU",
  tier: "S",
  order: 1,
  addedAt: 200,
  updatedAt: 200,
  ...over,
});

describe("board item identity", () => {
  it("namespaces ids so a tmdbId cannot collide with a channelId", () => {
    const [t, c] = toBoardItems([title({ tmdbId: 5 })], [channel({ channelId: "5" })]);
    expect(boardItemKey(t)).toBe("title:movie-5");
    expect(boardItemKey(c)).toBe("channel:5");
    expect(boardItemKey(t)).not.toBe(boardItemKey(c));
  });

  it("reports youtube for channels, which carry no mediaType", () => {
    const [t, c] = toBoardItems([title({ mediaType: "game" })], [channel()]);
    expect(boardItemCategory(t)).toBe("game");
    expect(boardItemCategory(c)).toBe("youtube");
  });
});

describe("filtering by category", () => {
  const items = toBoardItems(
    [title({ tmdbId: 1, mediaType: "movie" }), title({ tmdbId: 2, mediaType: "game" })],
    [channel()]
  );
  const opts = { search: "", sort: "manual" as const };

  it("keeps everything under all", () => {
    expect(filterAndSortBoardItems(items, { ...opts, category: "all" })).toHaveLength(3);
  });

  it("shows only channels under youtube", () => {
    const out = filterAndSortBoardItems(items, { ...opts, category: "youtube" });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("channel");
  });

  it("does not leak channels into the games tab", () => {
    const out = filterAndSortBoardItems(items, { ...opts, category: "game" });
    expect(out).toHaveLength(1);
    expect(boardItemCategory(out[0])).toBe("game");
  });

  it("searches across both kinds", () => {
    const out = filterAndSortBoardItems(items, { ...opts, category: "all", search: "канал" });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("channel");
  });
});

describe("splitting back to the two stores", () => {
  it("returns each row to its own store with the board's ordering", () => {
    const grouped = groupBoard(toBoardItems([title()], [channel()]));
    const flat = grouped.S.map((item, index) => ({ ...item, order: index }));
    const { titles, channels } = splitBoardItems(flat);

    expect(titles).toHaveLength(1);
    expect(channels).toHaveLength(1);
    expect(titles[0].order).toBe(0);
    expect(channels[0].order).toBe(1);
  });

  it("carries a tier change made on the board into the stored record", () => {
    const [item] = toBoardItems([], [channel({ tier: "S" })]);
    const { channels } = splitBoardItems([{ ...item, tier: "F" }]);
    expect(channels[0].tier).toBe("F");
  });

  it("groups both kinds into the same tier bucket", () => {
    const grouped = groupBoard(toBoardItems([title({ tier: "A" })], [channel({ tier: "A" })]));
    expect(grouped.A).toHaveLength(2);
    expect(grouped.S).toHaveLength(0);
  });
});
