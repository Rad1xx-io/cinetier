import { beforeEach, describe, expect, it } from "vitest";
import { isRankedChannel, validateImportedChannels } from "@/lib/storage/youtube/validation";
import { LocalStorageChannelRepository } from "@/lib/storage/youtube/local-storage-repository";
import type { RankedChannel } from "@/lib/types/youtube";

function makeChannel(overrides: Partial<RankedChannel> = {}): RankedChannel {
  return {
    channelId: "UC1",
    title: "Тестовый канал",
    thumbnailUrl: null,
    country: "RU",
    tier: "Unrated",
    order: 0,
    addedAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe("isRankedChannel", () => {
  it("accepts a well-formed record", () => {
    expect(isRankedChannel(makeChannel())).toBe(true);
  });

  it("rejects a record with an invalid tier", () => {
    expect(isRankedChannel({ ...makeChannel(), tier: "X" })).toBe(false);
  });

  it("rejects a record with an empty channelId", () => {
    expect(isRankedChannel({ ...makeChannel(), channelId: "" })).toBe(false);
  });

  it("accepts a record without the optional subscriberCount", () => {
    const withoutCount: Record<string, unknown> = { ...makeChannel() };
    delete withoutCount.subscriberCount;
    expect(isRankedChannel(withoutCount)).toBe(true);
  });
});

describe("validateImportedChannels", () => {
  it("accepts the { channels: [...] } wrapper produced by exportRatings", () => {
    const { valid } = validateImportedChannels({ version: 1, channels: [makeChannel()] });
    expect(valid).toHaveLength(1);
  });

  it("counts invalid entries without throwing", () => {
    const { valid, invalidCount } = validateImportedChannels([makeChannel(), { garbage: true }]);
    expect(valid).toHaveLength(1);
    expect(invalidCount).toBe(1);
  });
});

describe("LocalStorageChannelRepository", () => {
  let repo: LocalStorageChannelRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repo = new LocalStorageChannelRepository();
  });

  it("starts empty", () => {
    expect(repo.getAll()).toEqual([]);
  });

  it("adds a channel into Unrated by default", () => {
    const added = repo.add({
      channelId: "UC1",
      title: "Тестовый канал",
      thumbnailUrl: null,
      country: "RU",
    });
    expect(added.tier).toBe("Unrated");
    expect(added.order).toBe(0);
    expect(repo.getAll()).toHaveLength(1);
  });

  it("does not duplicate an already-added channel", () => {
    const input = { channelId: "UC1", title: "Канал", thumbnailUrl: null, country: null };
    repo.add(input);
    repo.add(input);
    expect(repo.getAll()).toHaveLength(1);
  });

  it("updates a channel's tier", () => {
    repo.add({ channelId: "UC1", title: "Канал", thumbnailUrl: null, country: null });
    const updated = repo.updateTier("UC1", "S");
    expect(updated?.tier).toBe("S");
  });

  it("removes a channel", () => {
    repo.add({ channelId: "UC1", title: "Канал", thumbnailUrl: null, country: null });
    repo.remove("UC1");
    expect(repo.getAll()).toHaveLength(0);
  });

  it("round-trips through exportRatings / importRatings", () => {
    repo.add({ channelId: "UC1", title: "Канал", thumbnailUrl: null, country: null });
    repo.updateTier("UC1", "A");

    const json = repo.exportRatings();
    const fresh = new LocalStorageChannelRepository();
    fresh.clearAll();

    const result = fresh.importRatings(json);
    expect(result.imported).toBe(1);
    expect(fresh.getByKey("UC1")?.tier).toBe("A");
  });
});
