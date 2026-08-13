import type { MediaType, TMDBMediaType } from "@/lib/types";

/** Each category owns its details route and data source — /title/[id] only ever handles TMDB's movie/tv. */
export function titleHref(mediaType: MediaType, tmdbId: number): string {
  if (mediaType === "anime") return `/anime/${tmdbId}`;
  if (mediaType === "game") return `/games/${tmdbId}`;
  return `/title/${mediaType}-${tmdbId}`;
}

export function parseTitleParam(param: string): { mediaType: TMDBMediaType; tmdbId: number } | null {
  const match = /^(movie|tv)-(\d+)$/.exec(param);
  if (!match) return null;
  return { mediaType: match[1] as TMDBMediaType, tmdbId: Number(match[2]) };
}
