import { describe, expect, it } from "vitest";
import { mapGameToDetails, mapGameToSummary } from "@/lib/igdb/mappers";
import type { IGDBGame } from "@/lib/igdb/types";

const game: IGDBGame = {
  id: 1020,
  name: "Grand Theft Auto V",
  summary: "An open world crime epic.",
  cover: { id: 1, image_id: "co1abc" },
  artworks: [{ id: 2, image_id: "ar2def" }],
  screenshots: [{ id: 3, image_id: "sc3ghi" }],
  genres: [{ id: 5, name: "Shooter" }, { id: 31, name: "Adventure" }],
  platforms: [{ id: 6, name: "PC (Microsoft Windows)" }],
  game_modes: [{ id: 1, name: "Single player" }, { id: 2, name: "Multiplayer" }],
  involved_companies: [
    { id: 10, developer: true, company: { id: 100, name: "Rockstar North" } },
    { id: 11, publisher: true, company: { id: 101, name: "Rockstar Games" } },
  ],
  websites: [
    { id: 20, url: "https://store.steampowered.com/app/271590", category: 13 },
    { id: 21, url: "https://www.rockstargames.com/V/", category: 1 },
  ],
  first_release_date: 1379635200,
  rating: 89.4,
  aggregated_rating: 94.6,
};

describe("mapGameToSummary", () => {
  it("builds a 2:3 portrait cover url so games match the poster grid", () => {
    expect(mapGameToSummary(game).posterPath).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1abc.jpg"
    );
  });

  it("falls back to the smaller cover preset, keeping the same aspect ratio", () => {
    expect(mapGameToSummary(game).fallbackImage).toBe(
      "https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg"
    );
  });

  it("prefers artwork over a screenshot for the wide banner", () => {
    expect(mapGameToSummary(game).headerImage).toContain("ar2def");
  });

  it("uses a screenshot when the game has no artwork", () => {
    expect(mapGameToSummary({ ...game, artworks: undefined }).headerImage).toContain("sc3ghi");
  });

  it("rescales the critic aggregate from 0-100 to TierListOnline's 0-10", () => {
    expect(mapGameToSummary(game).score).toBe(9.5);
  });

  it("falls back to the user rating when no critic aggregate exists", () => {
    expect(mapGameToSummary({ ...game, aggregated_rating: undefined }).score).toBe(8.9);
  });

  it("leaves the score null rather than inventing a zero", () => {
    expect(
      mapGameToSummary({ ...game, aggregated_rating: undefined, rating: undefined }).score
    ).toBeNull();
  });

  it("converts the unix release date to an ISO day", () => {
    expect(mapGameToSummary(game).releaseDate).toBe("2013-09-20");
  });

  it("keeps only developers out of involved companies", () => {
    expect(mapGameToSummary(game).developers).toEqual(["Rockstar North"]);
  });

  it("survives a game with nothing but an id and a name", () => {
    const summary = mapGameToSummary({ id: 7, name: "Bare" });
    expect(summary.posterPath).toBeNull();
    expect(summary.genres).toEqual([]);
    expect(summary.score).toBeNull();
  });
});

describe("mapGameToDetails", () => {
  it("picks the official site over the store link", () => {
    expect(mapGameToDetails(game).website).toBe("https://www.rockstargames.com/V/");
  });

  it("keeps only publishers", () => {
    expect(mapGameToDetails(game).publishers).toEqual(["Rockstar Games"]);
  });
});
