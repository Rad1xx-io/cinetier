import { describe, expect, it } from "vitest";
import { mapMediaToDetails, mapMediaToSummary } from "@/lib/anilist/mappers";
import type { AniListMedia } from "@/lib/anilist/types";

function makeRaw(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 16498,
    title: { romaji: "Shingeki no Kyojin", english: "Attack on Titan", native: "進撃の巨人" },
    description: "Humans fight titans.<br><br>\r\nA story of survival.",
    coverImage: { large: "https://s4.anilist.co/cover/large.jpg", medium: null, color: "#f1a143" },
    bannerImage: "https://s4.anilist.co/banner.jpg",
    startDate: { year: 2013, month: 4, day: 7 },
    season: "SPRING",
    seasonYear: 2013,
    episodes: 25,
    duration: 24,
    status: "FINISHED",
    genres: ["Action", "Drama", "Fantasy"],
    averageScore: 85,
    favourites: 86012,
    studios: { nodes: [{ name: "WIT STUDIO" }] },
    format: "TV",
    source: "MANGA",
    relations: {
      edges: [
        {
          relationType: "SEQUEL",
          node: { id: 20958, title: { romaji: "Season 2" }, type: "ANIME", format: "TV", coverImage: { medium: "https://x/y.jpg" } },
        },
        {
          relationType: "ADAPTATION",
          node: { id: 53390, title: { romaji: "Manga" }, type: "MANGA", format: "MANGA", coverImage: null },
        },
      ],
    },
    ...overrides,
  };
}

describe("mapMediaToSummary", () => {
  it("prefers the English title, falling back through romaji/native", () => {
    expect(mapMediaToSummary(makeRaw()).title).toBe("Attack on Titan");
    expect(mapMediaToSummary(makeRaw({ title: { romaji: "R", english: null, native: "N" } })).title).toBe("R");
    expect(mapMediaToSummary(makeRaw({ title: { romaji: null, english: null, native: "N" } })).title).toBe("N");
  });

  it("strips stray HTML tags from the description", () => {
    const summary = mapMediaToSummary(makeRaw());
    expect(summary.description).not.toContain("<br>");
    expect(summary.description).toContain("Humans fight titans.");
  });

  it("normalizes the 0-100 averageScore down to a 0-10 scale", () => {
    expect(mapMediaToSummary(makeRaw()).score).toBe(8.5);
    expect(mapMediaToSummary(makeRaw({ averageScore: null })).score).toBeNull();
  });

  it("prefers seasonYear over startDate.year", () => {
    expect(mapMediaToSummary(makeRaw({ seasonYear: 2014 })).year).toBe(2014);
    expect(mapMediaToSummary(makeRaw({ seasonYear: null })).year).toBe(2013);
  });

  it("flattens studio nodes to plain names", () => {
    expect(mapMediaToSummary(makeRaw()).studios).toEqual(["WIT STUDIO"]);
  });
});

describe("mapMediaToDetails", () => {
  it("keeps only ANIME relations, dropping MANGA nodes", () => {
    const details = mapMediaToDetails(makeRaw());
    expect(details.relations).toHaveLength(1);
    expect(details.relations[0].anilistId).toBe(20958);
  });

  it("carries the source field through", () => {
    expect(mapMediaToDetails(makeRaw()).source).toBe("MANGA");
  });
});
