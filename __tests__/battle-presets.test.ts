import { describe, expect, it } from "vitest";
import {
  BATTLE_PRESETS,
  presetBySlug,
  shufflePreset,
  titlesMatch,
} from "@/lib/battle/presets";
import { MIN_POOL_SIZE } from "@/lib/battle/pool";

describe("preset pools", () => {
  it("holds far more entries than one battle uses, so a reroll has somewhere to go", () => {
    for (const preset of BATTLE_PRESETS) {
      expect(preset.items.length).toBeGreaterThanOrEqual(30);
    }
  });

  it("has no duplicate ids inside a set", () => {
    for (const preset of BATTLE_PRESETS) {
      const ids = preset.items.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every entry an id in the app's own scheme", () => {
    for (const preset of BATTLE_PRESETS) {
      for (const item of preset.items) {
        expect(item.id).toMatch(/^(movie|tv|anime|game|youtube)-/);
      }
    }
  });

  it("can always fill a smallest-size battle", () => {
    for (const preset of BATTLE_PRESETS) {
      expect(preset.items.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE);
    }
  });

  it("resolves a set by slug", () => {
    expect(presetBySlug("modern-classics")?.category).toBe("cinema");
    expect(presetBySlug("nope")).toBeUndefined();
  });
});

describe("shufflePreset", () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: `movie-${i}`, title: `Ф ${i}` }));

  it("keeps every entry, losing and inventing none", () => {
    const shuffled = shufflePreset(items, 1);

    expect(shuffled).toHaveLength(items.length);
    expect(new Set(shuffled.map((i) => i.id))).toEqual(new Set(items.map((i) => i.id)));
  });

  it("is deterministic for a given seed", () => {
    // This is the whole point: the modal re-renders constantly, and a fresh
    // hand on every render would move entries out from under the creator.
    expect(shufflePreset(items, 7)).toEqual(shufflePreset(items, 7));
  });

  it("deals a different hand for a different seed", () => {
    const a = shufflePreset(items, 0).slice(0, 20);
    const b = shufflePreset(items, 1).slice(0, 20);

    expect(a.map((i) => i.id)).not.toEqual(b.map((i) => i.id));
  });

  it("does not mutate the pool it was given", () => {
    const original = [...items];

    shufflePreset(items, 3);

    expect(items).toEqual(original);
  });

  it("handles a single-entry and an empty pool", () => {
    expect(shufflePreset([{ id: "a", title: "A" }], 5)).toHaveLength(1);
    expect(shufflePreset([], 5)).toEqual([]);
  });

  it("reaches a different first entry across a handful of rerolls", () => {
    const firsts = new Set(
      Array.from({ length: 6 }, (_, seed) => shufflePreset(items, seed)[0].id)
    );

    expect(firsts.size).toBeGreaterThan(1);
  });
});

describe("titlesMatch", () => {
  it("accepts the same title", () => {
    expect(titlesMatch("Начало", "Начало")).toBe(true);
  });

  it("ignores case, punctuation and spacing between catalogs", () => {
    expect(titlesMatch("Ре:Зеро", "ре зеро")).toBe(true);
    expect(titlesMatch("Baldur's Gate 3", "baldurs gate 3")).toBe(true);
    expect(titlesMatch("Властелин колец: Братство кольца", "властелин колец братство кольца"))
      .toBe(true);
  });

  it("treats ё and е as the same letter", () => {
    expect(titlesMatch("Тёмный рыцарь", "Темный рыцарь")).toBe(true);
  });

  it("rejects two different works", () => {
    // The guard exists for exactly this: a mistyped preset id resolving to
    // something the creator rated, whose tier would otherwise be shipped as
    // their opinion of a film they never saw.
    expect(titlesMatch("Начало", "Интерстеллар")).toBe(false);
    expect(titlesMatch("Дюна", "Дюна: Часть вторая")).toBe(false);
  });
});

/**
 * The prefill that puts a creator's existing rating onto a preset row looks the
 * entry up by id and then checks the titles agree — see create-battle-modal.
 * Both halves have failed silently before, which is what these guard.
 */
describe("preset entries can still be matched against a board", () => {
  const items = BATTLE_PRESETS.flatMap((preset) => preset.items);

  it("carries no Cyrillic title", () => {
    // Boards are filled from catalogues answering in English now. A Russian
    // preset title would pass the id check and fail the title guard, and the
    // creator's own rating would quietly stop appearing.
    const cyrillic = items.filter((item) => /[\u0400-\u04FF]/.test(item.title));
    expect(cyrillic.map((i) => `${i.id} ${i.title}`)).toEqual([]);
  });

  it("names every anime entry with an AniList id, not a MyAnimeList one", () => {
    // Four entries held MAL ids, which resolve to nothing on AniList: no match,
    // and a details link to a page that does not exist. These four are the ones
    // that were wrong, kept as a regression guard.
    const anime = new Map(items.filter((i) => i.id.startsWith("anime-")).map((i) => [i.id, i.title]));
    for (const stale of ["anime-30276", "anime-31964", "anime-38000", "anime-32281", "anime-33486"]) {
      expect(anime.has(stale), `${stale} is a MyAnimeList id`).toBe(false);
    }
    expect(anime.get("anime-21087")).toBe("One-Punch Man");
    expect(anime.get("anime-21519")).toBe("Your Name.");
  });

  it("matches a board entry that came from the catalogue", () => {
    // What the modal actually does: find by id, then confirm the titles agree.
    const board = [
      { tmdbId: 27205, mediaType: "movie", title: "Inception" },
      { tmdbId: 16498, mediaType: "anime", title: "Attack on Titan" },
    ];
    const byId = new Map(board.map((t) => [`${t.mediaType}-${t.tmdbId}`, t]));

    for (const [id, expected] of [["movie-27205", "Inception"], ["anime-16498", "Attack on Titan"]]) {
      const item = items.find((i) => i.id === id);
      expect(item, `${id} missing from the presets`).toBeDefined();
      const own = byId.get(id);
      expect(own && titlesMatch(own.title, item!.title)).toBe(true);
      expect(item!.title).toBe(expected);
    }
  });

  it("refuses a board entry whose id collides but whose title does not", () => {
    // The reason the title guard exists: a curated id that turned out to point
    // somewhere else must not import an unrelated rating.
    const item = items.find((i) => i.id === "movie-27205")!;
    expect(titlesMatch("Some Other Film", item.title)).toBe(false);
  });
});
