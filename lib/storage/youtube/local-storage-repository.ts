import type { RankedChannel } from "@/lib/types/youtube";
import type { AddChannelInput, ChannelRankingRepository } from "@/lib/storage/youtube/repository";
import { isStorageAvailable, markStorageUnavailable } from "@/lib/storage/local-storage-repository";
import { validateImportedChannels } from "@/lib/storage/youtube/validation";

const STORAGE_KEY = "cinetier:youtube-rankings:v1";

export const CHANNEL_RANKINGS_CHANGED_EVENT = "cinetier:youtube-rankings-changed";

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANNEL_RANKINGS_CHANGED_EVENT));
  }
}

export class LocalStorageChannelRepository implements ChannelRankingRepository {
  private readCache(): RankedChannel[] {
    if (!isStorageAvailable()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const { valid } = validateImportedChannels(parsed);
      return valid;
    } catch {
      return [];
    }
  }

  private write(channels: RankedChannel[]) {
    if (!isStorageAvailable()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(channels));
    } catch {
      // Same reasoning as the titles repository's own write.
      markStorageUnavailable();
      return;
    }
    notifyChanged();
  }

  getAll(): RankedChannel[] {
    return this.readCache().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getByKey(channelId: string): RankedChannel | undefined {
    return this.readCache().find((c) => c.channelId === channelId);
  }

  add(input: AddChannelInput): RankedChannel {
    const channels = this.readCache();
    const existing = channels.find((c) => c.channelId === input.channelId);
    if (existing) return existing;

    const now = Date.now();
    const targetTier = input.tier ?? "Unrated";
    const maxOrder = channels
      .filter((c) => c.tier === targetTier)
      .reduce((max, c) => Math.max(max, c.order), -1);
    const record: RankedChannel = {
      channelId: input.channelId,
      title: input.title,
      thumbnailUrl: input.thumbnailUrl,
      country: input.country,
      tier: targetTier,
      order: maxOrder + 1,
      subscriberCount: input.subscriberCount,
      addedAt: now,
      updatedAt: now,
    };
    this.write([...channels, record]);
    return record;
  }

  remove(channelId: string): void {
    const channels = this.readCache();
    this.write(channels.filter((c) => c.channelId !== channelId));
  }

  updateTier(channelId: string, tier: RankedChannel["tier"]): RankedChannel | undefined {
    const channels = this.readCache();
    const maxOrder = channels
      .filter((c) => c.tier === tier)
      .reduce((max, c) => Math.max(max, c.order), -1);
    let updated: RankedChannel | undefined;
    const next = channels.map((c) => {
      if (c.channelId === channelId) {
        updated = { ...c, tier, order: maxOrder + 1, updatedAt: Date.now() };
        return updated;
      }
      return c;
    });
    this.write(next);
    return updated;
  }

  reorderAll(channels: RankedChannel[]): void {
    this.write(channels);
  }

  clearAll(): void {
    this.write([]);
  }

  exportRatings(): string {
    return JSON.stringify(
      { version: 1, exportedAt: Date.now(), channels: this.readCache() },
      null,
      2
    );
  }

  importRatings(json: string): { imported: number } {
    const parsed = JSON.parse(json);
    const { valid } = validateImportedChannels(parsed);
    if (valid.length === 0) {
      throw new Error("No valid ranked channels found in the file.");
    }

    const existing = this.readCache();
    const merged = new Map<string, RankedChannel>();
    for (const c of existing) merged.set(c.channelId, c);
    for (const c of valid) merged.set(c.channelId, c);

    this.write(Array.from(merged.values()));
    return { imported: valid.length };
  }
}

export const localStorageChannelRepository = new LocalStorageChannelRepository();
