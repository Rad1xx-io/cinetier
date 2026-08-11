import type { MediaType } from "@/lib/types";

/** /title/[id] encodes both the TMDB id and media type, since TMDB ids collide across movie/tv. */
export function titleHref(mediaType: MediaType, tmdbId: number): string {
  return `/title/${mediaType}-${tmdbId}`;
}

export function parseTitleParam(param: string): { mediaType: MediaType; tmdbId: number } | null {
  const match = /^(movie|tv)-(\d+)$/.exec(param);
  if (!match) return null;
  return { mediaType: match[1] as MediaType, tmdbId: Number(match[2]) };
}
