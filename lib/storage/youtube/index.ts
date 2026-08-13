import { localStorageChannelRepository } from "@/lib/storage/youtube/local-storage-repository";
import type { ChannelRankingRepository } from "@/lib/storage/youtube/repository";
import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

export { CHANNEL_RANKINGS_CHANGED_EVENT } from "@/lib/storage/youtube/local-storage-repository";
export type { AddChannelInput, ChannelRankingRepository } from "@/lib/storage/youtube/repository";

export const channelRepository: ChannelRankingRepository = localStorageChannelRepository;

export function getRatedChannels(): RankedChannel[] {
  return channelRepository.getAll();
}

export function getRankedChannel(channelId: string): RankedChannel | undefined {
  return channelRepository.getByKey(channelId);
}

export function addChannel(
  input: Parameters<ChannelRankingRepository["add"]>[0]
): RankedChannel {
  return channelRepository.add(input);
}

export function removeChannel(channelId: string): void {
  channelRepository.remove(channelId);
}

export function updateChannelTier(
  channelId: string,
  tier: TierOrUnrated
): RankedChannel | undefined {
  return channelRepository.updateTier(channelId, tier);
}

export function reorderAllChannels(channels: RankedChannel[]): void {
  channelRepository.reorderAll(channels);
}

export function clearAllChannels(): void {
  channelRepository.clearAll();
}

export function exportChannelRatings(): string {
  return channelRepository.exportRatings();
}

export function importChannelRatings(json: string): { imported: number } {
  return channelRepository.importRatings(json);
}
