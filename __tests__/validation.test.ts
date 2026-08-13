import { describe, expect, it } from "vitest";
import { isRankedTitle, isValidTier, validateImportedTitles } from "@/lib/storage/validation";
import type { RankedTitle } from "@/lib/types";

function makeTitle(overrides: Partial<RankedTitle> = {}): RankedTitle {
  return {
    tmdbId: 603,
    mediaType: "movie",
    title: "The Matrix",
    posterPath: "/poster.jpg",
    releaseDate: "1999-03-30",
    tier: "S",
    order: 0,
    addedAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("isValidTier", () => {
  it("accepts all known tiers and Unrated", () => {
    for (const tier of ["S", "A", "B", "C", "D", "F", "Unrated"]) {
      expect(isValidTier(tier)).toBe(true);
    }
  });

  it("rejects unknown values", () => {
    expect(isValidTier("SS")).toBe(false);
    expect(isValidTier(5)).toBe(false);
    expect(isValidTier(undefined)).toBe(false);
  });
});

describe("isRankedTitle", () => {
  it("accepts a well-formed record", () => {
    expect(isRankedTitle(makeTitle())).toBe(true);
  });

  it("rejects a record with an invalid tier", () => {
    expect(isRankedTitle({ ...makeTitle(), tier: "X" })).toBe(false);
  });

  it("rejects a record missing required fields", () => {
    const withoutOrder: Record<string, unknown> = { ...makeTitle() };
    delete withoutOrder.order;
    expect(isRankedTitle(withoutOrder)).toBe(false);
  });

  it("rejects a record with the wrong mediaType", () => {
    expect(isRankedTitle({ ...makeTitle(), mediaType: "book" })).toBe(false);
  });

  it("accepts an anime record (AniList id in the tmdbId field, namespaced by mediaType)", () => {
    expect(isRankedTitle(makeTitle({ tmdbId: 16498, mediaType: "anime", title: "Attack on Titan" }))).toBe(true);
  });

  it("rejects non-object input", () => {
    expect(isRankedTitle(null)).toBe(false);
    expect(isRankedTitle("not a title")).toBe(false);
  });

  it("accepts a record without voteAverage (older exports predate this field)", () => {
    const withoutVoteAverage: Record<string, unknown> = { ...makeTitle() };
    delete withoutVoteAverage.voteAverage;
    expect(isRankedTitle(withoutVoteAverage)).toBe(true);
  });

  it("accepts a record with a numeric voteAverage", () => {
    expect(isRankedTitle(makeTitle({ voteAverage: 8.4 }))).toBe(true);
  });

  it("rejects a record with a non-numeric voteAverage", () => {
    expect(isRankedTitle({ ...makeTitle(), voteAverage: "8.4" })).toBe(false);
  });
});

describe("validateImportedTitles", () => {
  it("accepts a plain array export", () => {
    const { valid, invalidCount } = validateImportedTitles([makeTitle(), makeTitle({ tmdbId: 2 })]);
    expect(valid).toHaveLength(2);
    expect(invalidCount).toBe(0);
  });

  it("accepts the { titles: [...] } wrapper produced by exportRatings", () => {
    const { valid } = validateImportedTitles({ version: 1, titles: [makeTitle()] });
    expect(valid).toHaveLength(1);
  });

  it("counts invalid entries without throwing", () => {
    const { valid, invalidCount } = validateImportedTitles([
      makeTitle(),
      { garbage: true },
      "not even an object",
    ]);
    expect(valid).toHaveLength(1);
    expect(invalidCount).toBe(2);
  });

  it("returns an empty result for unrelated JSON shapes", () => {
    const { valid, invalidCount } = validateImportedTitles({ hello: "world" });
    expect(valid).toHaveLength(0);
    expect(invalidCount).toBe(0);
  });
});
