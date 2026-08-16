import { describe, expect, it } from "vitest";
import { SEARCH_ALIASES } from "@/lib/search/aliases";
import { normalizeQuery } from "@/lib/search/normalize-query";

/** What a search for `input` will actually try, in order. */
function variants(input: string): string[] {
  return normalizeQuery(input).variants;
}

describe("alias map integrity", () => {
  it("keys are lowercase, so the lookup can normalise a query and match", () => {
    for (const key of Object.keys(SEARCH_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("keys hold nothing but Cyrillic, digits, spaces and hyphens", () => {
    // A stray character makes a key unreachable — a CJK glyph once sat in the
    // Hunter x Hunter entry, and nobody was ever going to type it.
    for (const key of Object.keys(SEARCH_ALIASES)) {
      expect(key, `unreachable key: ${key}`).toMatch(/^[а-яё0-9 -]+$/);
    }
  });

  it("targets are Latin, since the point is to reach an English catalogue", () => {
    for (const [key, target] of Object.entries(SEARCH_ALIASES)) {
      expect(target, `target for ${key}`).toMatch(/^[a-z0-9:;' .-]+$/);
    }
  });

  it("no key maps to itself", () => {
    for (const [key, target] of Object.entries(SEARCH_ALIASES)) {
      expect(target).not.toBe(key);
    }
  });

  it("no target is empty", () => {
    for (const target of Object.values(SEARCH_ALIASES)) {
      expect(target.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Russian input reaches an English target", () => {
  // Each of these returned nothing from AniList on its own when checked against
  // the live API, which is why it is in the map at all.
  it.each([
    ["реинкарнация безработного", "mushoku tensei"],
    ["мусоку тенсей", "mushoku tensei"],
    ["хантер х хантер", "hunter x hunter"],
    ["код гиас", "code geass"],
    ["поднятие уровня в одиночку", "solo leveling"],
    ["обещанный неверленд", "promised neverland"],
  ])("%s -> %s", (input, target) => {
    expect(variants(input)).toContain(target);
  });

  it.each([
    ["звёздные войны", "star wars"],
    ["во все тяжкие", "breaking bad"],
    ["властелин колец", "lord of the rings"],
    ["майнкрафт", "minecraft"],
    ["кс го", "counter-strike"],
  ])("%s -> %s", (input, target) => {
    expect(variants(input)).toContain(target);
  });

  it("keeps what was typed as the first attempt", () => {
    // The alias supplements, never replaces: AniList finds plenty of Russian
    // names through its own synonyms, and those results should come first.
    expect(variants("тетрадь смерти")[0]).toBe("тетрадь смерти");
    expect(variants("тетрадь смерти")).toContain("death note");
  });

  it("tolerates a typo in a mapped name", () => {
    expect(variants("майкрафт")).toContain("minecraft");
  });

  it("prefers the longer phrase when a shorter key also matches", () => {
    // "кс" alone is Counter-Strike; "кс 2" is the sequel, and the longer key
    // has to win or the sequel is unreachable.
    expect(variants("кс 2")).toContain("counter-strike 2");
  });

  it("leaves an English query untouched", () => {
    expect(variants("attack on titan")).toEqual(["attack on titan"]);
  });
});
