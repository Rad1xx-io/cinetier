import { describe, expect, it } from "vitest";
import { mapMediaToSummary } from "@/lib/anilist/mappers";
import type { AniListMedia } from "@/lib/anilist/types";

function media(overrides: Partial<AniListMedia>): AniListMedia {
  return {
    id: 1,
    title: { romaji: "Romaji Name", english: "English Name", native: "日本語" },
    ...overrides,
  } as AniListMedia;
}

/**
 * This file replaces one that asserted the opposite. AniList carries
 * community-submitted Russian names in `synonyms`, and the headline used to
 * prefer them; the catalogue reads in English now, so it no longer does.
 */
describe("anime title selection", () => {
  it("leads with the English title", () => {
    expect(mapMediaToSummary(media({})).title).toBe("English Name");
  });

  it("ignores a Russian synonym, however well-formed", () => {
    const summary = mapMediaToSummary(
      media({ synonyms: ["Shingeki no Kyojin", "Атака титанов"] })
    );
    expect(summary.title).toBe("English Name");
  });

  it("falls back to romaji when AniList has no English name", () => {
    const summary = mapMediaToSummary(
      media({ title: { romaji: "Romaji Name", english: null, native: "日本語" } })
    );
    expect(summary.title).toBe("Romaji Name");
  });

  it("falls back to the native name when that is all there is", () => {
    const summary = mapMediaToSummary(
      media({ title: { romaji: null, english: null, native: "日本語" } })
    );
    expect(summary.title).toBe("日本語");
  });

  it("names an entry with no title at all rather than rendering blank", () => {
    const summary = mapMediaToSummary(
      media({ title: { romaji: null, english: null, native: null } })
    );
    expect(summary.title).toBe("Untitled");
  });

  it("reports the three title variants verbatim", () => {
    // No synonym-derived substitutions any more: what AniList sends is what the
    // details page shows on its secondary lines.
    expect(mapMediaToSummary(media({ synonyms: ["Атака титанов"] })).titles).toEqual({
      romaji: "Romaji Name",
      english: "English Name",
      native: "日本語",
    });
  });

  it("leaves english null when AniList has none, instead of borrowing romaji", () => {
    const summary = mapMediaToSummary(
      media({ synonyms: ["Атака титанов"], title: { romaji: "Romaji Name", english: null, native: "日本語" } })
    );
    expect(summary.titles.english).toBeNull();
    expect(summary.title).toBe("Romaji Name");
  });
});
