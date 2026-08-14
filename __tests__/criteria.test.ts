import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESETS,
  PRESET_BY_ID,
  SCORE_MAX,
  SCORE_MIN,
  clampScore,
  normalizeCriterionName,
} from "@/lib/types/criteria";

describe("normalizeCriterionName", () => {
  it("treats case and surrounding space as the same name", () => {
    expect(normalizeCriterionName("  Сюжет ")).toBe(normalizeCriterionName("сюжет"));
  });

  it("keeps genuinely different names apart", () => {
    expect(normalizeCriterionName("Звук")).not.toBe(normalizeCriterionName("Музыка"));
  });
});

describe("clampScore", () => {
  it("holds the slider's range", () => {
    expect(clampScore(0)).toBe(SCORE_MIN);
    expect(clampScore(99)).toBe(SCORE_MAX);
  });

  it("rounds to the one decimal the step allows", () => {
    // Float arithmetic on a 0.1 step lands on values like 7.300000000000001.
    expect(clampScore(7.34)).toBe(7.3);
    expect(clampScore(7.300000000000001)).toBe(7.3);
  });

  it("falls back to the midpoint rather than propagating NaN", () => {
    expect(clampScore(Number.NaN)).toBe(5);
    expect(clampScore(Number.POSITIVE_INFINITY)).toBe(5);
  });
});

describe("DEFAULT_PRESETS", () => {
  it("has no duplicate criterion ids across groups", () => {
    const ids = DEFAULT_PRESETS.flatMap((g) => g.criteria.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("indexes every preset by id", () => {
    const total = DEFAULT_PRESETS.reduce((n, g) => n + g.criteria.length, 0);
    expect(Object.keys(PRESET_BY_ID)).toHaveLength(total);
    expect(PRESET_BY_ID.gameplay?.name).toBe("Геймплей");
  });

  it("gives cinema both a craft and an enjoyment group", () => {
    const cinema = DEFAULT_PRESETS.filter((g) => g.category === "cinema");
    expect(cinema).toHaveLength(2);
  });

  it("separates the two sound criteria, which share a label but not a group", () => {
    // "Звук" appears under both cinema and games; only the ids keep them apart.
    expect(PRESET_BY_ID.sound).toBeDefined();
    expect(PRESET_BY_ID["game-sound"]).toBeDefined();
  });
});
