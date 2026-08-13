import { describe, expect, it } from "vitest";
import { libraryPosterUrl, mapAppToDetails, mapAppToSummary } from "@/lib/steam/mappers";
import type { SteamAppData } from "@/lib/steam/types";

function makeApp(overrides: Partial<SteamAppData> = {}): SteamAppData {
  return {
    type: "game",
    name: "Ведьмак 3: Дикая Охота",
    steam_appid: 292030,
    short_description: "Вы — Геральт из Ривии.",
    header_image: "https://shared.akamai.steamstatic.com/header.jpg",
    genres: [{ id: "3", description: "Ролевые игры" }],
    categories: [
      { id: 2, description: "Одиночная игра" },
      { id: 9, description: "Кооператив" },
    ],
    developers: ["CD PROJEKT RED"],
    publishers: ["CD PROJEKT RED"],
    platforms: { windows: true, mac: false, linux: false },
    metacritic: { score: 93, url: "https://metacritic.com/x" },
    release_date: { coming_soon: false, date: "18 мая. 2015 г." },
    price_overview: { final_formatted: "29,99€" },
    ...overrides,
  };
}

describe("mapAppToSummary", () => {
  it("builds portrait library art from the app id so games share the film poster shape", () => {
    expect(mapAppToSummary(makeApp()).posterPath).toBe(libraryPosterUrl(292030));
    expect(libraryPosterUrl(292030)).toContain("/apps/292030/library_600x900.jpg");
  });

  it("pulls the year out of Steam's localized date string", () => {
    expect(mapAppToSummary(makeApp()).releaseDate).toBe("2015-01-01");
  });

  it("returns null for a date it cannot find a year in", () => {
    const app = makeApp({ release_date: { coming_soon: true, date: "Скоро" } });
    expect(mapAppToSummary(app).releaseDate).toBeNull();
  });

  it("rescales metacritic 0-100 onto the app-wide 0-10 score", () => {
    expect(mapAppToSummary(makeApp()).score).toBe(9.3);
  });

  it("leaves the score null when Steam has no metacritic entry", () => {
    expect(mapAppToSummary(makeApp({ metacritic: undefined })).score).toBeNull();
  });

  it("survives a response missing every optional field", () => {
    const bare: SteamAppData = { type: "game", name: "Без данных", steam_appid: 7 };
    const summary = mapAppToSummary(bare);
    expect(summary).toMatchObject({
      appId: 7,
      title: "Без данных",
      shortDescription: "",
      genres: [],
      categories: [],
      platforms: [],
      developers: [],
      releaseDate: null,
      score: null,
      isFree: false,
      price: null,
      fallbackImage: null,
    });
  });

  it("exposes store art as the fallback for the 404-prone portrait poster", () => {
    const summary = mapAppToSummary(makeApp());
    expect(summary.posterPath).toContain("library_600x900.jpg");
    expect(summary.fallbackImage).toBe("https://shared.akamai.steamstatic.com/header.jpg");
  });

  it("falls back to the capsule when Steam omits the header image", () => {
    const app = makeApp({ header_image: undefined, capsule_image: "https://cdn/capsule.jpg" });
    expect(mapAppToSummary(app).fallbackImage).toBe("https://cdn/capsule.jpg");
  });

  it("carries store features through for the game-mode filter", () => {
    expect(mapAppToSummary(makeApp()).categories).toEqual(["Одиночная игра", "Кооператив"]);
  });

  it("lists supported platforms on the summary, not just the details", () => {
    expect(mapAppToSummary(makeApp()).platforms).toEqual(["Windows"]);
  });

  it("strips markup Steam leaves in descriptions", () => {
    const app = makeApp({ short_description: "Строка<br>вторая <b>жирная</b>" });
    expect(mapAppToSummary(app).shortDescription).toBe("Строка\nвторая жирная");
  });
});

describe("mapAppToDetails", () => {
  it("lists only the platforms Steam flags as supported", () => {
    expect(mapAppToDetails(makeApp()).platforms).toEqual(["Windows"]);
    const all = makeApp({ platforms: { windows: true, mac: true, linux: true } });
    expect(mapAppToDetails(all).platforms).toEqual(["Windows", "macOS", "Linux"]);
  });

  it("carries the summary fields through unchanged", () => {
    const details = mapAppToDetails(makeApp());
    expect(details.title).toBe("Ведьмак 3: Дикая Охота");
    expect(details.score).toBe(9.3);
    expect(details.publishers).toEqual(["CD PROJEKT RED"]);
  });
});
