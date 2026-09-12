import type { ITunesSoftwareResult } from "@/lib/app-store/types";
import type { MobileGameDetails, MobileGameSummary } from "@/lib/types/mobile-game";

/** iTunes reports 0-5; rescaled to 0-10 so it lines up with GameSummary/TMDB/AniList scores. */
function rescaleRating(rating: number | undefined): number | null {
  return typeof rating === "number" ? Math.round(rating * 2 * 10) / 10 : null;
}

/**
 * Raw iTunes result → this app's shape, stamping `source` itself — the same
 * reason `lib/games/source.ts`'s own comment gives for why its mappers do
 * this rather than a caller tagging results afterwards: this module is the
 * one place that unambiguously knows which catalog just answered.
 */
export function mapITunesToSummary(result: ITunesSoftwareResult): MobileGameSummary {
  return {
    appId: result.trackId,
    source: "app_store",
    title: result.trackName,
    posterPath: result.artworkUrl512 ?? result.artworkUrl100 ?? null,
    developer: result.artistName,
    shortDescription: result.description ?? "",
    genres: result.genres ?? [],
    releaseDate: result.releaseDate ? result.releaseDate.slice(0, 10) : null,
    score: rescaleRating(result.averageUserRating),
    ratingCount: result.userRatingCount,
    isFree: (result.price ?? 0) === 0,
    price: result.formattedPrice ?? null,
  };
}

export function mapITunesToDetails(result: ITunesSoftwareResult): MobileGameDetails {
  return {
    ...mapITunesToSummary(result),
    storeUrl: result.trackViewUrl,
    minimumOsVersion: result.minimumOsVersion ?? null,
  };
}
