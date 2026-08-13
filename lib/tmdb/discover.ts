import "server-only";
import { tmdbFetch } from "@/lib/tmdb/client";
import { mapToSummary } from "@/lib/tmdb/mappers";
import { findGenre } from "@/lib/tmdb/genres";
import type { TMDBPagedResponse, TMDBRawMovie, TMDBRawTVShow } from "@/lib/tmdb/types";
import type { TMDBMediaType, TitleSummary } from "@/lib/types";

import type { TitleSort } from "@/lib/tmdb/title-filters";

/** TMDB names the date and title fields differently per media type. */
function sortParam(sort: TitleSort, type: TMDBMediaType): string {
  switch (sort) {
    case "rating":
      return "vote_average.desc";
    case "released":
      return type === "tv" ? "first_air_date.desc" : "primary_release_date.desc";
    case "title":
      return type === "tv" ? "name.asc" : "title.asc";
    case "popularity":
    default:
      return "popularity.desc";
  }
}

export interface DiscoverTitlesParams {
  type: "all" | TMDBMediaType;
  genre?: string;
  year?: number;
  minRating?: number;
  sort?: TitleSort;
  page?: number;
}

export interface DiscoverTitlesResult {
  results: TitleSummary[];
  totalPages: number;
  totalResults: number;
}

/**
 * Sorting by score with no floor on the vote count surfaces obscure titles
 * sitting on a perfect 10 from a handful of votes, so a minimum sample is part
 * of the sort itself — the same trap the games catalog hit with IGDB.
 */
const MIN_VOTES_FOR_RATING_SORT = 200;

async function discoverOne(
  type: TMDBMediaType,
  params: DiscoverTitlesParams
): Promise<DiscoverTitlesResult> {
  const genre = params.genre ? await findGenre(params.genre) : undefined;
  const genreId = type === "tv" ? genre?.tvId : genre?.movieId;

  // A genre that exists only for the other media type must return nothing
  // rather than silently dropping the filter and showing everything.
  if (params.genre && !genreId) {
    return { results: [], totalPages: 0, totalResults: 0 };
  }

  const sort = params.sort ?? "popularity";
  const query: Record<string, string | number | undefined> = {
    page: params.page ?? 1,
    sort_by: sortParam(sort, type),
    include_adult: "false",
    with_genres: genreId,
    "vote_average.gte": params.minRating || undefined,
    "vote_count.gte": sort === "rating" ? MIN_VOTES_FOR_RATING_SORT : undefined,
  };

  if (params.year) {
    if (type === "tv") query.first_air_date_year = params.year;
    else query.primary_release_year = params.year;
  }

  const data =
    type === "tv"
      ? await tmdbFetch<TMDBPagedResponse<TMDBRawTVShow>>("/discover/tv", query)
      : await tmdbFetch<TMDBPagedResponse<TMDBRawMovie>>("/discover/movie", query);

  return {
    results: data.results.map((r) => mapToSummary(r, type)),
    totalPages: data.total_pages,
    totalResults: data.total_results,
  };
}

export async function discoverTitles(
  params: DiscoverTitlesParams
): Promise<DiscoverTitlesResult> {
  if (params.type !== "all") return discoverOne(params.type, params);

  // "Все" asks both catalogs and interleaves them, so neither type is buried
  // behind a full page of the other.
  const [movies, tv] = await Promise.all([
    discoverOne("movie", params),
    discoverOne("tv", params),
  ]);

  const merged: TitleSummary[] = [];
  const longest = Math.max(movies.results.length, tv.results.length);
  for (let i = 0; i < longest; i++) {
    if (movies.results[i]) merged.push(movies.results[i]);
    if (tv.results[i]) merged.push(tv.results[i]);
  }

  return {
    results: merged,
    totalPages: Math.max(movies.totalPages, tv.totalPages),
    totalResults: movies.totalResults + tv.totalResults,
  };
}
