import { describe, expect, it } from "vitest";
import { mapITunesToDetails, mapITunesToSummary } from "@/lib/app-store/mappers";
import type { ITunesSoftwareResult } from "@/lib/app-store/types";

function result(overrides: Partial<ITunesSoftwareResult> = {}): ITunesSoftwareResult {
  return {
    trackId: 6448786147,
    trackName: "Some Mobile Game",
    artistName: "Some Studio",
    artworkUrl512: "https://example.com/icon512.png",
    description: "A mobile game.",
    releaseDate: "2023-05-01T07:00:00Z",
    genres: ["Games", "Action"],
    averageUserRating: 4.5,
    userRatingCount: 1000,
    formattedPrice: "Free",
    price: 0,
    trackViewUrl: "https://apps.apple.com/app/id6448786147",
    minimumOsVersion: "16.0",
    ...overrides,
  };
}

describe("mapITunesToSummary", () => {
  it("stamps the source and carries identity/display fields", () => {
    const summary = mapITunesToSummary(result());
    expect(summary).toMatchObject({
      appId: 6448786147,
      source: "app_store",
      title: "Some Mobile Game",
      developer: "Some Studio",
      posterPath: "https://example.com/icon512.png",
      genres: ["Games", "Action"],
    });
  });

  it("rescales the 0-5 rating to 0-10, matching GameSummary's convention", () => {
    expect(mapITunesToSummary(result({ averageUserRating: 4.5 })).score).toBe(9);
    expect(mapITunesToSummary(result({ averageUserRating: undefined })).score).toBeNull();
  });

  it("slices the full timestamp down to a bare date", () => {
    expect(mapITunesToSummary(result({ releaseDate: "2023-05-01T07:00:00Z" })).releaseDate).toBe(
      "2023-05-01"
    );
  });

  it("falls back to the 100px icon when the 512px one is missing", () => {
    const summary = mapITunesToSummary(
      result({ artworkUrl512: undefined, artworkUrl100: "https://example.com/icon100.png" })
    );
    expect(summary.posterPath).toBe("https://example.com/icon100.png");
  });

  it("treats a zero price as free, and a real price as not", () => {
    expect(mapITunesToSummary(result({ price: 0 })).isFree).toBe(true);
    expect(mapITunesToSummary(result({ price: 4.99, formattedPrice: "$4.99" })).isFree).toBe(false);
  });
});

describe("mapITunesToDetails", () => {
  it("adds the store link and minimum OS version on top of the summary", () => {
    const details = mapITunesToDetails(result());
    expect(details.storeUrl).toBe("https://apps.apple.com/app/id6448786147");
    expect(details.minimumOsVersion).toBe("16.0");
    expect(details.source).toBe("app_store");
  });
});
