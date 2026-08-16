import "server-only";
import type { AnimeDetails, AnimeSearchResponse } from "@/lib/types/anime";
import { AniListError } from "@/lib/anilist/client";
import { discoverAnime, getAnimeDetails, getAnimeGenres } from "@/lib/anilist/discovery";
import { AnimeSourceError, type AnimeQuery, type AnimeSource } from "@/lib/anime-sources/anime-source";

/**
 * Translates AniList's own error into the shared one, so a route can map a
 * failure to a status without knowing which source answered.
 */
async function adapt<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AniListError) {
      throw new AnimeSourceError(error.message, error.status, "anilist");
    }
    throw new AnimeSourceError("AniList request failed.", 502, "anilist");
  }
}

/**
 * The original catalogue, wrapped rather than rewritten.
 *
 * Nothing under lib/anilist changed: the GraphQL client, queries and mappers
 * are exactly as they were, waiting for the API to come back. This file is the
 * whole of the adaptation, and the factory decides which source is live.
 */
export const anilistSource: AnimeSource = {
  id: "anilist",

  search(query: AnimeQuery): Promise<AnimeSearchResponse> {
    return adapt(() => discoverAnime(query));
  },

  getDetails(id: number): Promise<AnimeDetails | null> {
    return adapt(() => getAnimeDetails(id));
  },

  getGenres(): Promise<string[]> {
    return adapt(() => getAnimeGenres());
  },
};
