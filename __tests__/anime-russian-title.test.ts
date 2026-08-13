import { describe, expect, it } from "vitest";
import { mapMediaToSummary } from "@/lib/anilist/mappers";
import type { AniListMedia } from "@/lib/anilist/types";

function media(overrides: Partial<AniListMedia>): AniListMedia {
  return {
    id: 1,
    name: undefined as never,
    title: { romaji: "Romaji Name", english: "English Name", native: "日本語" },
    ...overrides,
  } as AniListMedia;
}

describe("Russian title selection", () => {
  it("prefers a Russian synonym over the English title", () => {
    const summary = mapMediaToSummary(
      media({ synonyms: ["Shingeki no Kyojin", "Атака титанов"] })
    );
    expect(summary.title).toBe("Атака титанов");
  });

  it("keeps the English name reachable as the secondary line", () => {
    const summary = mapMediaToSummary(media({ synonyms: ["Атака титанов"] }));
    expect(summary.titles.english).toBe("English Name");
  });

  it("skips Ukrainian, which is Cyrillic but not Russian", () => {
    // The real case that exposed this: AniList lists "Сталевий алхімік" for
    // Fullmetal Alchemist, and a plain Cyrillic test happily picked it.
    const summary = mapMediaToSummary(
      media({ synonyms: ["Сталевий алхімік. Братерство"] })
    );
    expect(summary.title).toBe("English Name");
  });

  it("skips Serbian", () => {
    expect(mapMediaToSummary(media({ synonyms: ["Напад титана њихов"] })).title).toBe(
      "English Name"
    );
  });

  it("ignores a mostly-Latin string containing one Cyrillic letter", () => {
    expect(mapMediaToSummary(media({ synonyms: ["Attack on Titan (Атака)"] })).title).toBe(
      "English Name"
    );
  });

  it("falls back through english, romaji, native when there is no synonym", () => {
    expect(mapMediaToSummary(media({ synonyms: [] })).title).toBe("English Name");
    expect(
      mapMediaToSummary(
        media({ synonyms: [], title: { romaji: "Romaji", english: null, native: "日本語" } })
      ).title
    ).toBe("Romaji");
  });
});
