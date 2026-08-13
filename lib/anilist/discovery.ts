import "server-only";
import type { AnimeFormat, AnimeSortMode } from "@/lib/anilist/anime-filters";
import { anilistFetch } from "@/lib/anilist/client";
import { DISCOVER_ANIME_QUERY, ANIME_DETAILS_QUERY, GENRE_COLLECTION_QUERY } from "@/lib/anilist/queries";
import { mapMediaToDetails, mapMediaToSummary } from "@/lib/anilist/mappers";
import type {
  AniListGenreCollectionResponse,
  AniListMediaResponse,
  AniListPageResponse,
} from "@/lib/anilist/types";
import type { AnimeDetails, AnimeSearchResponse, AnimeSeason, AnimeStatus } from "@/lib/types/anime";



/** AniList's Media query natively supports search+genre+year+season+status+sort+pagination in one call — unlike YouTube, no client-side merging of multiple queries is needed. */
const SORT_MAP: Record<AnimeSortMode, string[]> = {
  popularity: ["POPULARITY_DESC"],
  score: ["SCORE_DESC"],
  favourites: ["FAVOURITES_DESC"],
  release_date: ["START_DATE_DESC"],
  title: ["TITLE_ROMAJI"],
};

export interface DiscoverAnimeParams {
  query?: string;
  genre?: string;
  year?: number;
  season?: AnimeSeason;
  status?: AnimeStatus;
  format?: AnimeFormat;
  sort?: AnimeSortMode;
  page?: number;
  perPage?: number;
}

export async function discoverAnime(params: DiscoverAnimeParams): Promise<AnimeSearchResponse> {
  const data = await anilistFetch<AniListPageResponse>(DISCOVER_ANIME_QUERY, {
    page: params.page ?? 1,
    perPage: params.perPage ?? 24,
    search: params.query?.trim() || undefined,
    genre: params.genre || undefined,
    seasonYear: params.year,
    season: params.season,
    status: params.status,
    format: params.format,
    sort: SORT_MAP[params.sort ?? "popularity"],
  });

  return {
    results: data.Page.media.map(mapMediaToSummary),
    hasNextPage: data.Page.pageInfo.hasNextPage,
  };
}

export async function getAnimeDetails(id: number): Promise<AnimeDetails | null> {
  const data = await anilistFetch<AniListMediaResponse>(ANIME_DETAILS_QUERY, { id });
  return data.Media ? mapMediaToDetails(data.Media) : null;
}

/** AniList's genre list includes "Hentai" — filtered out, this is a personal media tracker, not an adult-content catalog. */
const EXCLUDED_GENRES = new Set(["Hentai"]);

export async function getAnimeGenres(): Promise<string[]> {
  const data = await anilistFetch<AniListGenreCollectionResponse>(GENRE_COLLECTION_QUERY);
  return data.GenreCollection.filter((g) => !EXCLUDED_GENRES.has(g));
}
