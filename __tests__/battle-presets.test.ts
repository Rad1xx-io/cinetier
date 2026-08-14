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
