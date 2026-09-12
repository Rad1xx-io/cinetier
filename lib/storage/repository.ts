import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";
import type { GameSource } from "@/lib/types/game";
import type { AnimeCatalogSource } from "@/lib/types/anime";
import type { MobileGameSource } from "@/lib/types/mobile-game";

export interface AddTitleInput {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  tier?: TierOrUnrated;
  voteAverage?: number;
  /** Only meaningful for `mediaType: "game"` — see `RankedTitle.gameSource`. */
  gameSource?: GameSource;
  /** Only meaningful for `mediaType: "anime"` — see `RankedTitle.animeSource`. */
  animeSource?: AnimeCatalogSource;
  /** Only meaningful for `mediaType: "mobile_game"` — see `RankedTitle.mobileGameSource`. */
  mobileGameSource?: MobileGameSource;
}

/**
 * Storage contract for personal rankings. The MVP ships `LocalStorageRepository`;
 * a future `SupabaseRepository` implementing the same interface can replace it
 * without touching any UI code.
 */
export interface RankingRepository {
  getAll(): RankedTitle[];
  getByKey(
    tmdbId: number,
    mediaType: MediaType,
    gameSource?: GameSource,
    animeSource?: AnimeCatalogSource
  ): RankedTitle | undefined;
  add(input: AddTitleInput): RankedTitle;
  remove(
    tmdbId: number,
    mediaType: MediaType,
    gameSource?: GameSource,
    animeSource?: AnimeCatalogSource
  ): void;
  updateTier(
    tmdbId: number,
    mediaType: MediaType,
    tier: TierOrUnrated,
    gameSource?: GameSource,
    animeSource?: AnimeCatalogSource
  ): RankedTitle | undefined;
  /** Replaces the whole breakdown; an empty array clears it. */
  updateCriteria(
    tmdbId: number,
    mediaType: MediaType,
    criteriaScores: CriterionScore[],
    gameSource?: GameSource,
    animeSource?: AnimeCatalogSource
  ): RankedTitle | undefined;
  /** Overwrites the full list, used to persist drag-and-drop tier/order changes in one write. */
  reorderAll(titles: RankedTitle[]): void;
  clearAll(): void;
  exportRatings(): string;
  importRatings(json: string): { imported: number };
}

/**
 * The identity string every store keys a ranked title on.
 *
 * `gameSource`/`animeSource` only ever change the result for their own
 * `mediaType`, and only when actually known — both absent produces exactly
 * the key this function has always produced, so every title ranked before
 * either parameter existed keeps the same key it already has on disk. A
 * *new* game or anime with a known source gets a key no old, unlabelled
 * entry can collide with, which is the point: see `RankedTitle.gameSource`
 * and `RankedTitle.animeSource` for why a bare `mediaType:tmdbId` stopped
 * being a safe identity for either.
 */
export function titleKey(
  tmdbId: number,
  mediaType: MediaType,
  gameSource?: GameSource,
  animeSource?: AnimeCatalogSource
): string {
  const suffix =
    mediaType === "game" && gameSource
      ? `:${gameSource}`
      : mediaType === "anime" && animeSource
        ? `:${animeSource}`
        : "";
  return `${mediaType}:${tmdbId}${suffix}`;
}
