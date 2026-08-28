import { localStorageRepository } from "@/lib/storage/local-storage-repository";
import { rememberCatalogIfUnset } from "@/lib/storage/last-catalog";
import { trackFirstTitleRanked } from "@/lib/analytics/events";
import type { RankingRepository } from "@/lib/storage/repository";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";

export { RANKINGS_CHANGED_EVENT } from "@/lib/storage/local-storage-repository";
export type { AddTitleInput, RankingRepository } from "@/lib/storage/repository";
export { titleKey } from "@/lib/storage/repository";

/**
 * Active repository instance. Swapping to Supabase later means changing this
 * one binding (e.g. `export const repository: RankingRepository = new SupabaseRepository()`)
 * — no UI code depends on the concrete implementation.
 */
export const repository: RankingRepository = localStorageRepository;

export function getRatedTitles(): RankedTitle[] {
  return repository.getAll();
}

export function getRankedTitle(tmdbId: number, mediaType: MediaType): RankedTitle | undefined {
  return repository.getByKey(tmdbId, mediaType);
}

export function addTitle(input: Parameters<RankingRepository["add"]>[0]): RankedTitle {
  // Ranking something is a statement about which list matters, and for
  // somebody who has never picked one it is the only statement available.
  // It does not overwrite a choice already made — see rememberCatalogIfUnset.
  rememberCatalogIfUnset(input.mediaType);

  /*
   * Read before the write, not after: `repository.add` returns the existing
   * row unchanged when the title is already ranked, so checking the count
   * afterwards would misfire on a duplicate add. Checking the fact — the list
   * was empty and this call is the one that ends that — is what the funnel
   * asked for, computed from the store that is already the source of truth
   * rather than a remembered flag that a cleared cache or a second device
   * could get wrong.
   */
  const wasEmpty = repository.getAll().length === 0;
  const added = repository.add(input);
  if (wasEmpty) trackFirstTitleRanked();
  return added;
}

export function removeTitle(tmdbId: number, mediaType: MediaType): void {
  repository.remove(tmdbId, mediaType);
}

export function updateTier(
  tmdbId: number,
  mediaType: MediaType,
  tier: TierOrUnrated
): RankedTitle | undefined {
  return repository.updateTier(tmdbId, mediaType, tier);
}

export function updateCriteria(
  tmdbId: number,
  mediaType: MediaType,
  criteriaScores: CriterionScore[]
): RankedTitle | undefined {
  return repository.updateCriteria(tmdbId, mediaType, criteriaScores);
}

export function reorderAll(titles: RankedTitle[]): void {
  repository.reorderAll(titles);
}

export function clearAll(): void {
  repository.clearAll();
}

export function exportRatings(): string {
  return repository.exportRatings();
}

export function importRatings(json: string): { imported: number } {
  return repository.importRatings(json);
}
