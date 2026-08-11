const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export type PosterSize = "w185" | "w342" | "w500";
export type BackdropSize = "w780" | "w1280" | "original";

export function posterUrl(path: string | null, size: PosterSize = "w342"): string | null {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}

export function backdropUrl(path: string | null, size: BackdropSize = "w1280"): string | null {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/${size}${path}`;
}
