import { describe, expect, it } from "vitest";
import {
  cleanSynopsis,
  mapFormat,
  mapJikanToDetails,
  mapJikanToSummary,
  mapRelations,
  mapSeason,
  mapStatus,
  mergedGenres,
  parseDurationMinutes,
} from "@/lib/anime-sources/jikan-adapter";
import type { JikanAnime } from "@/lib/anime-sources/jikan-types";

/**
 * Trimmed from the live response for MAL 16498, so the shapes here are the ones
 * the API actually sends rather than the ones the docs describe.
 */
const attackOnTitan: JikanAnime = {
  mal_id: 16498,
  title: "Shingeki no Kyojin",
  title_english: "Attack on Titan",
  title_japanese: "進撃の巨人",
  title_synonyms: ["AoT", "SnK"],
  titles: [
    { type: "Default", title: "Shingeki no Kyojin" },
    { type: "English", title: "Attack on Titan" },
    { type: "German", title: "Attack on Titan" },
  ],
  images: {
    jpg: {
      image_url: "https://cdn.myanimelist.net/images/anime/10/47347.jpg",
      small_image_url: "https://cdn.myanimelist.net/images/anime/10/47347t.jpg",
      large_image_url: "https://cdn.myanimelist.net/images/anime/10/47347l.jpg",
    },
  },
  synopsis: "Centuries ago, mankind was slaughtered. [Written by MAL Rewrite]",
  type: "TV",
  source: "Manga",
  episodes: 25,
  duration: "24 min per ep",
  status: "Finished Airing",
  airing: false,
  score: 8.57,
  favorites: 190638,
  year: 2013,
  season: "spring",
  aired: { prop: { from: { day: 7, month: 4, year: 2013 } } },
  genres: [{ mal_id: 1, type: "anime", name: "Action", url: "" }],
  themes: [{ mal_id: 58, type: "anime", name: "Gore", url: "" }],
  demographics: [{ mal_id: 27, type: "anime", name: "Shounen", url: "" }],
  studios: [{ mal_id: 858, type: "anime", name: "Wit Studio", url: "" }],
};

describe("parseDurationMinutes", () => {
  it("reads the per-episode form", () => {
    expect(parseDurationMinutes("24 min per ep")).toBe(24);
  });

  it("sums hours and minutes for a film", () => {
    expect(parseDurationMinutes("1 hr 59 min")).toBe(119);
  });

  it("handles a bare hour", () => {
    expect(parseDurationMinutes("2 hr")).toBe(120);
  });

  it("returns null when there is no number to read", () => {
    expect(parseDurationMinutes("Unknown")).toBeNull();
    expect(parseDurationMinutes(null)).toBeNull();
    expect(parseDurationMinutes("")).toBeNull();
  });
});

describe("mapStatus", () => {
  it("maps the three states MyAnimeList publishes", () => {
    expect(mapStatus("Finished Airing")).toBe("FINISHED");
    expect(mapStatus("Currently Airing")).toBe("RELEASING");
    expect(mapStatus("Not yet aired")).toBe("NOT_YET_RELEASED");
  });

  it("is case-insensitive", () => {
    expect(mapStatus("finished airing")).toBe("FINISHED");
  });

  // CANCELLED and HIATUS exist in our type but not on MyAnimeList; a guess
  // would be worse than an absence.
  it("returns null for anything it does not recognise", () => {
    expect(mapStatus("Cancelled")).toBeNull();
    expect(mapStatus(null)).toBeNull();
  });
});

describe("mapSeason", () => {
  it("upper-cases the lowercase value Jikan sends", () => {
    expect(mapSeason("spring")).toBe("SPRING");
    expect(mapSeason("fall")).toBe("FALL");
  });

  it("rejects anything outside the four seasons", () => {
    expect(mapSeason("monsoon")).toBeNull();
    expect(mapSeason(null)).toBeNull();
  });
});

describe("mapFormat", () => {
  it("matches the vocabulary the format filter uses", () => {
    expect(mapFormat("TV")).toBe("TV");
    expect(mapFormat("Movie")).toBe("MOVIE");
    expect(mapFormat("Special")).toBe("SPECIAL");
  });

  it("returns null for an empty value", () => {
    expect(mapFormat(null)).toBeNull();
    expect(mapFormat("  ")).toBeNull();
  });
});

describe("cleanSynopsis", () => {
  it("drops the MAL credit line", () => {
    expect(cleanSynopsis("A story. [Written by MAL Rewrite]")).toBe("A story.");
  });

  it("leaves an ordinary synopsis alone", () => {
    expect(cleanSynopsis("A story.")).toBe("A story.");
  });

  it("turns a missing synopsis into an empty string, not null", () => {
    expect(cleanSynopsis(null)).toBe("");
  });
});

describe("mergedGenres", () => {
  it("folds themes and demographics in with genres", () => {
    expect(mergedGenres(attackOnTitan)).toEqual(["Action", "Gore", "Shounen"]);
  });

  it("does not repeat a name that appears in two lists", () => {
    const raw = {
      ...attackOnTitan,
      themes: [{ mal_id: 1, type: "anime", name: "Action", url: "" }],
    };
    expect(mergedGenres(raw)).toEqual(["Action", "Shounen"]);
  });
});

describe("mapJikanToSummary", () => {
  const summary = mapJikanToSummary(attackOnTitan);

  it("carries the MyAnimeList id in the field the board stores", () => {
    expect(summary.anilistId).toBe(16498);
  });

  it("leads with the English title", () => {
    expect(summary.title).toBe("Attack on Titan");
    expect(summary.titles).toEqual({
      romaji: "Shingeki no Kyojin",
      english: "Attack on Titan",
      native: "進撃の巨人",
    });
  });

  it("takes the largest cover available", () => {
    expect(summary.coverImage).toBe("https://cdn.myanimelist.net/images/anime/10/47347l.jpg");
  });

  it("falls back through the image sizes when the large one is missing", () => {
    const raw = {
      ...attackOnTitan,
      images: { jpg: { image_url: "medium.jpg", small_image_url: "small.jpg", large_image_url: null } },
    };
    expect(mapJikanToSummary(raw).coverImage).toBe("medium.jpg");
  });

  // MyAnimeList publishes no wide artwork at all.
  it("has no banner", () => {
    expect(summary.bannerImage).toBeNull();
  });

  it("keeps the score on the 0-10 scale it already uses", () => {
    // AniList sent 0-100 and was divided by ten; doing that here would give 0.86.
    expect(summary.score).toBe(8.57);
  });

  it("normalises duration, status, season and format", () => {
    expect(summary.duration).toBe(24);
    expect(summary.status).toBe("FINISHED");
    expect(summary.season).toBe("SPRING");
    expect(summary.format).toBe("TV");
  });

  it("reads favourites from the American spelling", () => {
    expect(summary.favourites).toBe(190638);
  });

  it("strips the credit line from the description", () => {
    expect(summary.description).toBe("Centuries ago, mankind was slaughtered.");
  });

  it("takes the year from the aired date when the year field is empty", () => {
    const raw = { ...attackOnTitan, year: null };
    expect(mapJikanToSummary(raw).year).toBe(2013);
  });

  it("survives an entry with nothing but an id and a title", () => {
    const bare: JikanAnime = {
      mal_id: 1,
      title: "Cowboy Bebop",
      title_english: null,
      title_japanese: null,
      synopsis: null,
      type: null,
      source: null,
      episodes: null,
      duration: null,
      status: null,
      score: null,
      favorites: null,
      year: null,
      season: null,
    };
    const mapped = mapJikanToSummary(bare);
    expect(mapped.title).toBe("Cowboy Bebop");
    expect(mapped.coverImage).toBeNull();
    expect(mapped.genres).toEqual([]);
    expect(mapped.studios).toEqual([]);
    expect(mapped.description).toBe("");
  });
});

describe("mapRelations", () => {
  const raw: JikanAnime = {
    ...attackOnTitan,
    relations: [
      { relation: "Sequel", entry: [{ mal_id: 25777, type: "anime", name: "Season 2", url: "" }] },
      { relation: "Adaptation", entry: [{ mal_id: 23390, type: "manga", name: "Manga", url: "" }] },
    ],
  };

  it("flattens the groups and keeps the relation kind on each entry", () => {
    expect(mapRelations(raw)).toEqual([
      { anilistId: 25777, title: "Season 2", relationType: "Sequel", coverImage: null, format: null },
    ]);
  });

  // Manga and novels link to pages this app does not have.
  it("drops everything that is not an anime", () => {
    expect(mapRelations(raw).some((r) => r.title === "Manga")).toBe(false);
  });

  it("returns an empty list when the plain endpoint was used", () => {
    expect(mapRelations(attackOnTitan)).toEqual([]);
  });
});

describe("mapJikanToDetails", () => {
  it("adds source and relations on top of the summary", () => {
    const details = mapJikanToDetails(attackOnTitan);
    expect(details.anilistId).toBe(16498);
    // Kept readable rather than forced into AniList's LIGHT_NOVEL casing.
    expect(details.source).toBe("Manga");
    expect(details.relations).toEqual([]);
  });
});
