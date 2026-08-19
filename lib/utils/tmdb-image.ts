import { displayWidthFromSizes } from "@/lib/utils/image-source";

const IMAGE_BASE_URL = "https://image.tmdb.org/t/p";

export type PosterSize = "w92" | "w154" | "w185" | "w342" | "w500";

/**
 * The width to ask TMDB for, given how wide the card will actually be.
 *
 * These used to be one hardcoded `w342` for everything, which the optimizer
 * hid: it re-encoded down to whatever the layout needed, so the oversampling
 * cost nothing. Fetching straight from TMDB there is no such step, and the
 * difference is the whole page weight — 39 covers on a catalogue are 1.7MB at
 * w342 against 614KB at w185.
 *
 * Capped at w185 on purpose. Everything that derives its size this way is a
 * grid — a catalogue, a board, a feed, a battle roster — where a page holds
 * dozens of covers at 120px or less. The pages that show one poster large say
 * so by passing `size` explicitly, and are left alone.
 */
export function posterSizeForDisplay(sizes: string | undefined): PosterSize {
  // Shared with the CDN resizer, and careful to ignore the media conditions:
  // "(max-width: 640px) 144px" is a 144px card, not a 640px one.
  const display = displayWidthFromSizes(sizes);

  // Two-times for a retina screen, then the smallest bucket that covers it.
  const wanted = display * 2;
  if (wanted <= 92) return "w92";
  if (wanted <= 154) return "w154";
  return "w185";
}
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
