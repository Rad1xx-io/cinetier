import type { ITunesSoftwareResult } from "@/lib/app-store/types";
import type { MobileGameDetails, MobileGameSummary } from "@/lib/types/mobile-game";

/** iTunes reports 0-5; rescaled to 0-10 so it lines up with GameSummary/TMDB/AniList scores. */
function rescaleRating(rating: number | undefined): number | null {
  return typeof rating === "number" ? Math.round(rating * 2 * 10) / 10 : null;
}

/**
 * `entity=software` on iTunes Search covers the whole App Store, not just
 * games — searching "photo" really does return Google Photos, Picsart and
 * PicCollage alongside anything actually game-shaped, verified live against
 * the real endpoint. Neither an input filter closes this: `genreId` is
 * silently ignored by this endpoint (same result count and rows with or
 * without it, checked live) and `entity=softwareGame` is rejected outright
 * ("Invalid value(s) for key(s): [resultEntity]") — post-filtering is the
 * only lever this API actually gives.
 *
 * `primaryGenreName` rather than checking `genres` for "Games" anywhere in
 * the list: verified live across 16 real games spanning every sub-genre
 * (Action, Puzzle, Strategy, Roleplaying, Board, Word, Racing, Sports,
 * Trivia, Casual, Family, Simulation, Adventure, Card, Arcade) that Apple's
 * own `primaryGenreName` is always exactly "Games" for a real game — no
 * sub-genre allowlist to keep in sync with Apple's own taxonomy as it
 * evolves. `genres` alone is looser than it looks: Khan Academy Kids lists
 * `['Education', 'Family', 'Games', 'Adventure']` but Apple's own primary
 * classification for it is "Education" — an app that merely touches on
 * game-like mechanics is not the same claim as a game, and `primaryGenreName`
 * is Apple's own answer to which one a given app actually is.
 */
export function isGameResult(result: ITunesSoftwareResult): boolean {
  return result.primaryGenreName === "Games";
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
