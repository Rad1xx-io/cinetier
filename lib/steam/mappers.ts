import type { GameDetails, GameSummary } from "@/lib/types/game";
import type { SteamAppData } from "@/lib/steam/types";

/**
 * Portrait library art, built from the app id rather than read from the API —
 * appdetails only returns landscape capsules, and the tier list needs the same
 * 2:3 shape as film posters. Verified present back to Steam's oldest titles.
 */
export function libraryPosterUrl(appId: number): string {
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

/**
 * Steam only exposes a localized display date ("19 May, 2015"), which no date
 * parser handles across locales. The year is the only part the app
 * actually uses (card label, "sort by year"), so pull it out and normalize.
 */
function releaseYearToIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const year = /\b(\d{4})\b/.exec(raw)?.[1];
  return year ? `${year}-01-01` : null;
}

function stripHtml(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .trim();
}

function platformList(raw: SteamAppData): string[] {
  const platforms: string[] = [];
  if (raw.platforms?.windows) platforms.push("Windows");
  if (raw.platforms?.mac) platforms.push("macOS");
  if (raw.platforms?.linux) platforms.push("Linux");
  return platforms;
}

export function mapAppToSummary(raw: SteamAppData): GameSummary {
  return {
    appId: raw.steam_appid,
    title: raw.name,
    posterPath: libraryPosterUrl(raw.steam_appid),
    headerImage: raw.header_image ?? raw.capsule_image ?? null,
    fallbackImage: raw.header_image ?? raw.capsule_image ?? null,
    shortDescription: stripHtml(raw.short_description),
    genres: raw.genres?.map((g) => g.description) ?? [],
    categories: raw.categories?.map((c) => c.description) ?? [],
    platforms: platformList(raw),
    developers: raw.developers ?? [],
    releaseDate: releaseYearToIso(raw.release_date?.date),
    // Metacritic is 0-100; every other category in the app scores 0-10.
    score: raw.metacritic ? Math.round(raw.metacritic.score) / 10 : null,
    isFree: Boolean(raw.is_free),
    price: raw.price_overview?.final_formatted ?? null,
  };
}

export function mapAppToDetails(raw: SteamAppData): GameDetails {
  return {
    ...mapAppToSummary(raw),
    publishers: raw.publishers ?? [],
    website: raw.website ?? null,
  };
}
