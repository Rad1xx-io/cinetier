import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";

export interface AddTitleInput {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  tier?: TierOrUnrated;
  voteAverage?: number;
}

/**
 * Storage contract for personal rankings. The MVP ships `LocalStorageRepository`;
 * a future `SupabaseRepository` implementing the same interface can replace it
 * without touching any UI code.
 */
export interface RankingRepository {
  getAll(): RankedTitle[];
  getByKey(tmdbId: number, mediaType: MediaType): RankedTitle | undefined;
  add(input: AddTitleInput): RankedTitle;
  remove(tmdbId: number, mediaType: MediaType): void;
  updateTier(tmdbId: number, mediaType: MediaType, tier: TierOrUnrated): RankedTitle | undefined;
  /** Replaces the whole breakdown; an empty array clears it. */
  updateCriteria(
    tmdbId: number,
    mediaType: MediaType,
    criteriaScores: CriterionScore[]
  ): RankedTitle | undefined;
  /** Overwrites the full list, used to persist drag-and-drop tier/order changes in one write. */
  reorderAll(titles: RankedTitle[]): void;
  clearAll(): void;
  exportRatings(): string;
  importRatings(json: string): { imported: number };
}

export function titleKey(tmdbId: number, mediaType: MediaType): string {
  return `${mediaType}:${tmdbId}`;
}
