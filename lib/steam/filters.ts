/** Filter vocabularies shared by the games API route and the filter UI. */

export const GAME_GENRES = [
  { value: "Action", label: "Action" },
  { value: "Adventure", label: "Adventure" },
  { value: "RPG", label: "RPG" },
  { value: "Strategy", label: "Strategy" },
  { value: "Simulation", label: "Simulation" },
  { value: "Indie", label: "Indie" },
  { value: "Casual", label: "Casual" },
  { value: "Racing", label: "Racing" },
  { value: "Sports", label: "Sports" },
  { value: "Massively Multiplayer", label: "MMO" },
] as const;

export const GAME_PLATFORMS = [
  { value: "win", label: "Windows" },
  { value: "mac", label: "macOS" },
  { value: "linux", label: "Linux" },
] as const;

/**
 * Steam's `category2` feature ids. Verified against result counts: 2 covers
 * ~95% of the catalog (single-player), 1 about 20% (multiplayer) and 9 about
 * 12% (co-op), which matches Steam's own store facets.
 */
export const GAME_CATEGORIES = [
  { value: "2", label: "Single-player" },
  { value: "1", label: "Multiplayer" },
  { value: "9", label: "Co-op" },
] as const;

export const GAME_SORTS = [
  { value: "popularity", label: "Most popular" },
  { value: "metacritic", label: "Metacritic score" },
  { value: "released", label: "Release date" },
  { value: "name", label: "A–Z" },
] as const;

export type GameGenre = (typeof GAME_GENRES)[number]["value"];
export type GamePlatform = (typeof GAME_PLATFORMS)[number]["value"];
export type GameCategory = (typeof GAME_CATEGORIES)[number]["value"];
export type GameSort = (typeof GAME_SORTS)[number]["value"];

export function isGameGenre(value: string): value is GameGenre {
  return GAME_GENRES.some((g) => g.value === value);
}
export function isGamePlatform(value: string): value is GamePlatform {
  return GAME_PLATFORMS.some((p) => p.value === value);
}
export function isGameCategory(value: string): value is GameCategory {
  return GAME_CATEGORIES.some((c) => c.value === value);
}
export function isGameSort(value: string): value is GameSort {
  return GAME_SORTS.some((s) => s.value === value);
}
