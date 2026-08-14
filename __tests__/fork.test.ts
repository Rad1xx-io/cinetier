import { describe, expect, it } from "vitest";
import { forkChannels, forkTitles, normaliseOrder, sortByBoardPosition } from "@/lib/storage/fork";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";
import type { RankedChannel } from "@/lib/types/youtube";

function title(
  tmdbId: number,
  name: string,
  tier: TierOrUnrated,
  order = 0,
  extra: Partial<RankedTitle> = {}
): RankedTitle {
  return {
    tmdbId,
    mediaType: "movie" as MediaType,
    title: name,
    posterPath: null,
    releaseDate: null,
    tier,
    order,
    addedAt: 1_000,
    updatedAt: 1_000,
    ...extra,
  };
}

const NOW = 9_999;

describe("forkTitles — replace", () => {
  it("adopts the author's board wholesale", () => {
    const source = [title(1, "A", "S"), title(2, "B", "B")];

    const result = forkTitles([title(9, "Моё", "A")], source, "replace", NOW);

    expect(result.items.map((t) => t.tmdbId)).toEqual([1, 2]);
    expect(result.added).toBe(2);
    expect(result.kept).toBe(0);
  });

  it("works onto an empty list", () => {
    const result = forkTitles([], [title(1, "A", "S")], "replace", NOW);

    expect(result.items).toHaveLength(1);
    expect(result.added).toBe(1);
  });

  it("copies nothing when the source is empty", () => {
    const result = forkTitles([title(9, "Моё", "A")], [], "replace", NOW);

    expect(result.items).toEqual([]);
    expect(result.added).toBe(0);
  });

  it("preserves the author's tiers exactly", () => {
    const source = [title(1, "A", "S"), title(2, "B", "F"), title(3, "C", "Unrated")];

    const result = forkTitles([], source, "replace", NOW);

    expect(result.items.map((t) => t.tier)).toEqual(["S", "F", "Unrated"]);
  });

  it("re-stamps the copies as the forker's own", () => {
    const result = forkTitles([], [title(1, "A", "S")], "replace", NOW);

    expect(result.items[0].addedAt).toBe(NOW);
    expect(result.items[0].updatedAt).toBe(NOW);
  });

  it("leaves the author's criteria breakdown behind", () => {
    const scores: CriterionScore[] = [{ criterionId: "story", name: "Сюжет", score: 9 }];
    const source = [title(1, "A", "S", 0, { criteriaScores: scores })];

    const result = forkTitles([], source, "replace", NOW);

    expect(result.items[0].criteriaScores).toBeUndefined();
    // The tier is the thing being forked, so that must survive.
    expect(result.items[0].tier).toBe("S");
  });

  it("does not mutate either input list", () => {
    const scores: CriterionScore[] = [{ criterionId: "story", name: "Сюжет", score: 9 }];
    const source = [title(1, "A", "S", 0, { criteriaScores: scores })];
    const current = [title(9, "Моё", "A")];

    forkTitles(current, source, "replace", NOW);

    expect(source[0].criteriaScores).toEqual(scores);
    expect(source[0].addedAt).toBe(1_000);
    expect(current).toHaveLength(1);
  });
});

describe("forkTitles — merge", () => {
  it("keeps the viewer's own titles and adds only what is missing", () => {
    const current = [title(1, "Общий", "F"), title(9, "Только моё", "A")];
    const source = [title(1, "Общий", "S"), title(2, "Только чужое", "B")];

    const result = forkTitles(current, source, "merge", NOW);

    expect(result.items.map((t) => t.tmdbId).sort()).toEqual([1, 2, 9]);
    expect(result.added).toBe(1);
    expect(result.kept).toBe(2);
  });

  it("never overwrites a rating the viewer already made", () => {
    const current = [title(1, "Общий", "F")];
    const source = [title(1, "Общий", "S")];

    const result = forkTitles(current, source, "merge", NOW);

    // The viewer put it in F. A merge that silently promoted it to the author's
    // S would replace their opinion with a stranger's.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].tier).toBe("F");
    expect(result.added).toBe(0);
  });

  it("matches on media type as well as id", () => {
    const current = [title(1, "Фильм", "S")];
    const source = [title(1, "Аниме с тем же id", "A", 0, { mediaType: "anime" })];

    const result = forkTitles(current, source, "merge", NOW);

    expect(result.items).toHaveLength(2);
    expect(result.added).toBe(1);
  });

  it("gives the viewer's titles the top slots of their tier", () => {
    const current = [title(9, "Моё", "S", 0)];
    const source = [title(1, "Чужое", "S", 0)];

    const result = forkTitles(current, source, "merge", NOW);

    const inS = result.items.filter((t) => t.tier === "S");
    expect(inS.map((t) => t.tmdbId)).toEqual([9, 1]);
    expect(inS.map((t) => t.order)).toEqual([0, 1]);
  });

  it("is a plain copy when the viewer has nothing", () => {
    const source = [title(1, "A", "S"), title(2, "B", "A")];

    const merged = forkTitles([], source, "merge", NOW);
    const replaced = forkTitles([], source, "replace", NOW);

    expect(merged.items).toEqual(replaced.items);
  });

  it("changes nothing when the author adds no new titles", () => {
    const current = [title(1, "A", "S"), title(2, "B", "A")];
    const source = [title(1, "A", "F"), title(2, "B", "F")];

    const result = forkTitles(current, source, "merge", NOW);

    expect(result.added).toBe(0);
    expect(result.items.map((t) => t.tier)).toEqual(["S", "A"]);
  });
});

describe("ordering", () => {
  it("sorts by tier first, then position within it", () => {
    const titles = [
      title(1, "B-second", "B", 1),
      title(2, "S-first", "S", 0),
      title(3, "B-first", "B", 0),
      title(4, "Unrated", "Unrated", 0),
    ];

    expect(sortByBoardPosition(titles).map((t) => t.tmdbId)).toEqual([2, 3, 1, 4]);
  });

  it("reproduces the author's arrangement, not their array order", () => {
    const source = [title(1, "Второй в S", "S", 1), title(2, "Первый в S", "S", 0)];

    const result = forkTitles([], source, "replace", NOW);

    expect(result.items.map((t) => t.tmdbId)).toEqual([2, 1]);
  });

  it("renumbers each tier from zero without gaps", () => {
    const merged = normaliseOrder([
      title(1, "A", "S", 40),
      title(2, "B", "S", 40),
      title(3, "C", "B", 7),
    ]);

    expect(merged.filter((t) => t.tier === "S").map((t) => t.order)).toEqual([0, 1]);
    expect(merged.filter((t) => t.tier === "B").map((t) => t.order)).toEqual([0]);
  });

  it("leaves an already-correct entry untouched", () => {
    const original = title(1, "A", "S", 0);

    const [result] = normaliseOrder([original]);

    // Same reference: nothing changed, so nothing needs re-rendering downstream.
    expect(result).toBe(original);
  });

  it("gives every card in a tier a distinct slot after a merge", () => {
    const current = [title(1, "A", "S", 0), title(2, "B", "S", 1)];
    const source = [title(3, "C", "S", 0), title(4, "D", "S", 1)];

    const result = forkTitles(current, source, "merge", NOW);
    const orders = result.items.map((t) => t.order);

    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([0, 1, 2, 3]);
  });
});

function channel(
  channelId: string,
  name: string,
  tier: TierOrUnrated,
  order = 0
): RankedChannel {
  return {
    channelId,
    title: name,
    thumbnailUrl: null,
    country: null,
    tier,
    order,
    addedAt: 1_000,
    updatedAt: 1_000,
  };
}

describe("forkChannels", () => {
  it("copies the author's channels wholesale on replace", () => {
    const source = [channel("UC-a", "Канал A", "S"), channel("UC-b", "Канал B", "C")];

    const result = forkChannels([channel("UC-mine", "Мой", "A")], source, "replace", NOW);

    expect(result.items.map((c) => c.channelId)).toEqual(["UC-a", "UC-b"]);
    expect(result.items.map((c) => c.tier)).toEqual(["S", "C"]);
    expect(result.added).toBe(2);
    expect(result.kept).toBe(0);
  });

  it("keeps the viewer's own channels on merge", () => {
    const current = [channel("UC-shared", "Общий", "F"), channel("UC-mine", "Мой", "A")];
    const source = [channel("UC-shared", "Общий", "S"), channel("UC-new", "Новый", "B")];

    const result = forkChannels(current, source, "merge", NOW);

    expect(result.items.map((c) => c.channelId).sort()).toEqual(["UC-mine", "UC-new", "UC-shared"]);
    expect(result.added).toBe(1);
    expect(result.kept).toBe(2);
  });

  it("never overwrites a channel the viewer already rated", () => {
    const result = forkChannels(
      [channel("UC-shared", "Общий", "F")],
      [channel("UC-shared", "Общий", "S")],
      "merge",
      NOW
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].tier).toBe("F");
    expect(result.added).toBe(0);
  });

  it("matches on channel id, which shares no namespace with title ids", () => {
    const result = forkChannels([], [channel("UC-a", "Канал", "S")], "replace", NOW);

    expect(result.items[0].channelId).toBe("UC-a");
    expect(result.items[0].addedAt).toBe(NOW);
  });

  it("renumbers channel order per tier like titles do", () => {
    const current = [channel("UC-1", "Мой", "S", 0)];
    const source = [channel("UC-2", "Чужой", "S", 0), channel("UC-3", "Ещё", "S", 1)];

    const result = forkChannels(current, source, "merge", NOW);
    const orders = result.items.map((c) => c.order);

    expect(orders).toEqual([0, 1, 2]);
    expect(result.items[0].channelId).toBe("UC-1");
  });

  it("copies nothing when the author has no channels", () => {
    const result = forkChannels([channel("UC-mine", "Мой", "A")], [], "merge", NOW);

    expect(result.added).toBe(0);
    expect(result.items).toHaveLength(1);
  });

  it("does not mutate the source list", () => {
    const source = [channel("UC-a", "Канал", "S")];

    forkChannels([], source, "replace", NOW);

    expect(source[0].addedAt).toBe(1_000);
  });
});
