/**
 * Filter vocabulary shared by the discover route and the filter UI.
 *
 * Kept apart from `lib/tmdb/discover.ts` on purpose: that module is
 * `server-only`, and a client component importing these constants from it would
 * drag the whole server module into the browser bundle and fail the build.
 * `lib/steam/filters.ts` splits the same way for the same reason.
 */

export const TITLE_SORTS = [
  { value: "popularity", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "released", label: "Release date" },
  { value: "title", label: "A–Z" },
] as const;

export type TitleSort = (typeof TITLE_SORTS)[number]["value"];

export function isTitleSort(value: string): value is TitleSort {
  return TITLE_SORTS.some((s) => s.value === value);
}
