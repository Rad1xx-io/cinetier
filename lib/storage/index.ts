import { localStorageRepository } from "@/lib/storage/local-storage-repository";
import type { RankingRepository } from "@/lib/storage/repository";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";

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
  return repository.add(input);
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
