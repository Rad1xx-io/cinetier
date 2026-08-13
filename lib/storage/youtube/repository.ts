import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

export interface AddChannelInput {
  channelId: string;
  title: string;
  thumbnailUrl: string | null;
  country: string | null;
  tier?: TierOrUnrated;
  subscriberCount?: number;
}

/** Same shape as RankingRepository (lib/storage/repository.ts) for movies/TV, kept as a parallel independent system per-category. */
export interface ChannelRankingRepository {
  getAll(): RankedChannel[];
  getByKey(channelId: string): RankedChannel | undefined;
  add(input: AddChannelInput): RankedChannel;
  remove(channelId: string): void;
  updateTier(channelId: string, tier: TierOrUnrated): RankedChannel | undefined;
  reorderAll(channels: RankedChannel[]): void;
  clearAll(): void;
  exportRatings(): string;
  importRatings(json: string): { imported: number };
}
