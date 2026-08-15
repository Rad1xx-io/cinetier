/**
 * Filter vocabulary shared by the anime route and the filter UI. Separate from
 * the `server-only` discovery module so client components can import it — see
 * lib/tmdb/title-filters.ts for the same split.
 */

export const ANIME_FORMATS = [
  { value: "TV", label: "TV series" },
  { value: "MOVIE", label: "Film" },
  { value: "OVA", label: "OVA" },
  { value: "ONA", label: "ONA" },
  { value: "SPECIAL", label: "Special" },
] as const;

export type AnimeFormat = (typeof ANIME_FORMATS)[number]["value"];

export function isAnimeFormat(value: string): value is AnimeFormat {
  return ANIME_FORMATS.some((f) => f.value === value);
}

export const ANIME_SORTS = [
  { value: "popularity", label: "Most popular" },
  { value: "score", label: "Highest rated" },
  { value: "favourites", label: "Most followed" },
  { value: "release_date", label: "Release date" },
  { value: "title", label: "A–Z" },
] as const;

export type AnimeSortMode = (typeof ANIME_SORTS)[number]["value"];

export function isAnimeSort(value: string): value is AnimeSortMode {
  return ANIME_SORTS.some((s) => s.value === value);
}
