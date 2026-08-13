import { describe, expect, it } from "vitest";
import { normalizeQuery } from "@/lib/search/normalize-query";

describe("normalizeQuery", () => {
  it("always searches what was actually typed first", () => {
    expect(normalizeQuery("ведьмак").variants[0]).toBe("ведьмак");
    expect(normalizeQuery("inception").variants[0]).toBe("inception");
  });

  it("corrects a typo in a known name", () => {
    // One dropped letter — the case from the report.
    expect(normalizeQuery("майкрафт").corrected).toBe("minecraft");
    expect(normalizeQuery("ванпачмен").corrected).toBe("one punch man");
  });

  it("expands an abbreviation into a name no transliteration would reach", () => {
    expect(normalizeQuery("кс го").corrected).toBe("counter-strike");
  });

  it("says nothing about an abbreviation that is merely re-spelled", () => {
    // "гта" transliterates straight to "gta", so there is no insight to offer —
    // but the Latin form is still searched.
    const result = normalizeQuery("гта");
    expect(result.corrected).toBeNull();
    expect(result.variants).toContain("gta");
  });

  it("stays quiet when the alias is just the same word in Latin", () => {
    // "наруто" is spelled correctly; answering it with "возможно, вы искали
    // naruto" would be correcting a user who made no mistake.
    const result = normalizeQuery("наруто");
    expect(result.corrected).toBeNull();
    expect(result.variants).toContain("naruto");
  });

  it("transliterates when there is no alias to apply", () => {
    expect(normalizeQuery("дота 2").variants).toContain("dota 2");
  });

  it("leaves a Latin query alone", () => {
    const result = normalizeQuery("Elden Ring");
    expect(result.corrected).toBeNull();
    expect(result.variants).toEqual(["Elden Ring"]);
  });

  it("does not invent a correction for an unknown title", () => {
    // A real film that resembles nothing in the dictionary must pass through.
    expect(normalizeQuery("Whiplash").corrected).toBeNull();
  });

  it("refuses to correct a short word, where one letter is a different word", () => {
    // "кот" is 3 letters; bending it into "кс" would be nonsense.
    expect(normalizeQuery("кот").corrected).not.toBe("counter-strike");
  });

  it("collapses whitespace and trims", () => {
    expect(normalizeQuery("  elden   ring  ").original).toBe("elden ring");
  });

  it("survives an empty query", () => {
    expect(normalizeQuery("   ")).toEqual({ original: "", corrected: null, variants: [] });
  });

  it("never repeats a variant", () => {
    const { variants } = normalizeQuery("минкрафт");
    expect(new Set(variants).size).toBe(variants.length);
  });
});
