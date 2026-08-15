import { tmdbFetch } from "@/lib/tmdb/client";
import { parseWatchProviders, type RawWatchProvidersResponse, type WatchProviders } from "@/lib/services/watch-providers";

// Re-exported so callers have one import for the feature, even though the pure
// half lives next door and can be used without dragging `server-only` along.
export * from "@/lib/services/watch-providers";

/**
 * Which services carry a title in a given region.
 *
 * Defaults to US rather than RU deliberately: TMDB sources this from JustWatch,
 * which carries no Russian region at all — a RU request comes back empty for
 * every title, which would look like a broken feature rather than absent data.
 *
 * Returns null on any failure. Availability is a nice-to-have beside the rest
 * of a details page, and must never be the reason the page fails to render.
 */
export async function getWatchProviders(
  tmdbId: number,
  mediaType: "movie" | "tv",
  region = "US"
): Promise<WatchProviders | null> {
  try {
    const payload = await tmdbFetch<RawWatchProvidersResponse>(
      `/${mediaType}/${tmdbId}/watch/providers`
    );
    return parseWatchProviders(payload, region);
  } catch {
    return null;
  }
}
