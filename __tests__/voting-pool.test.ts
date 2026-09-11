import { describe, expect, it } from "vitest";
import { buildVotingPool, categoryForPool, isRatedTier } from "@/lib/voting/pool";
import type { RankedTitle } from "@/lib/types";

function title(overrides: Partial<RankedTitle> = {}): RankedTitle {
  return {
    tmdbId: 1,
    mediaType: "movie",
    title: "A Film",
    posterPath: "/poster.jpg",
    releaseDate: "2020-01-01",
    tier: "S",
    order: 0,
    addedAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("isRatedTier", () => {
  it("is true for every real tier", () => {
    for (const tier of ["S", "A", "B", "C", "D", "F"]) {
      expect(isRatedTier(tier)).toBe(true);
    }
  });

  it("is false for Unrated", () => {
    expect(isRatedTier("Unrated")).toBe(false);
  });
});

describe("buildVotingPool", () => {
  it("carries identity, display fields, and resolves the poster to an absolute url", () => {
    const pool = buildVotingPool([title({ tmdbId: 42, title: "Interstellar", posterPath: "/int.jpg" })]);

    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({
      itemKey: "movie-42",
      tmdbId: 42,
      mediaType: "movie",
      title: "Interstellar",
      releaseDate: "2020-01-01",
    });
    // A relative TMDB path becomes an absolute url at freeze time — see the
    // function's own comment for why (the session can outlive the board).
    expect(pool[0].posterPath).toMatch(/^https:\/\//);
  });

  it("builds distinct itemKeys for a Steam game and an IGDB game sharing a tmdbId — the same collision migrations 031/032 already closed", () => {
    const pool = buildVotingPool([
      title({ tmdbId: 233, mediaType: "game", gameSource: "steam", title: "Half-Life 2 (Steam)" }),
      title({ tmdbId: 233, mediaType: "game", gameSource: "igdb", title: "Some Other Game (IGDB)" }),
    ]);

    expect(pool[0].itemKey).not.toBe(pool[1].itemKey);
    expect(pool[0].itemKey).toBe("game-233-steam");
    expect(pool[1].itemKey).toBe("game-233-igdb");
  });

  it("leaves an absolute (non-TMDB) poster url unchanged", () => {
    const pool = buildVotingPool([
      title({
        mediaType: "anime",
        animeSource: "anilist",
        posterPath: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/x.jpg",
      }),
    ]);
    expect(pool[0].posterPath).toBe(
      "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/x.jpg"
    );
  });
});

describe("categoryForPool", () => {
  it("is the one media type when the pool is homogeneous", () => {
    const pool = buildVotingPool([title({ tmdbId: 1 }), title({ tmdbId: 2 })]);
    expect(categoryForPool(pool)).toBe("movie");
  });

  it("is 'mixed' the moment the pool spans more than one media type", () => {
    const pool = buildVotingPool([
      title({ tmdbId: 1, mediaType: "movie" }),
      title({ tmdbId: 2, mediaType: "tv" }),
    ]);
    expect(categoryForPool(pool)).toBe("mixed");
  });
});
