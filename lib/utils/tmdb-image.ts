const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export type PosterSize = "w185" | "w342" | "w500";
export type BackdropSize = "w780" | "w1280" | "original";

/** Anime covers (AniList) are stored as full absolute URLs, unlike TMDB's relative paths — pass those through unchanged. */
function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function posterUrl(path: string | null, size: PosterSize = "w342"): string | null {
  if (!path) return null;
  if (isAbsoluteUrl(path)) return path;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function backdropUrl(path: string | null, size: BackdropSize = "w1280"): string | null {
  if (!path) return null;
  if (isAbsoluteUrl(path)) return path;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}
