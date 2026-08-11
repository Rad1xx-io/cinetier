import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageRepository } from "@/lib/storage/local-storage-repository";

describe("LocalStorageRepository", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it("starts empty", () => {
    expect(repo.getAll()).toEqual([]);
  });

  it("adds a title into Unrated by default", () => {
    const added = repo.add({
      tmdbId: 603,
      mediaType: "movie",
      title: "The Matrix",
      posterPath: "/poster.jpg",
      releaseDate: "1999-03-30",
    });

    expect(added.tier).toBe("Unrated");
    expect(added.order).toBe(0);
    expect(repo.getAll()).toHaveLength(1);
  });

  it("does not duplicate an already-added title", () => {
    const input = {
      tmdbId: 603,
      mediaType: "movie" as const,
      title: "The Matrix",
      posterPath: "/poster.jpg",
      releaseDate: "1999-03-30",
    };
    repo.add(input);
    repo.add(input);
    expect(repo.getAll()).toHaveLength(1);
  });

  it("updates a title's tier and bumps updatedAt", async () => {
    const added = repo.add({
      tmdbId: 603,
      mediaType: "movie",
      title: "The Matrix",
      posterPath: null,
      releaseDate: "1999-03-30",
    });

    await new Promise((r) => setTimeout(r, 2));
    const updated = repo.updateTier(603, "movie", "S");

    expect(updated?.tier).toBe("S");
    expect(updated?.updatedAt).toBeGreaterThan(added.updatedAt);
  });

  it("removes a title", () => {
    repo.add({ tmdbId: 603, mediaType: "movie", title: "The Matrix", posterPath: null, releaseDate: null });
    repo.remove(603, "movie");
    expect(repo.getAll()).toHaveLength(0);
  });

  it("persists across repository instances via localStorage", () => {
    repo.add({ tmdbId: 1, mediaType: "tv", title: "Breaking Bad", posterPath: null, releaseDate: null });
    const otherInstance = new LocalStorageRepository();
    expect(otherInstance.getAll()).toHaveLength(1);
  });

  it("reorderAll persists the full list including tier and order changes", () => {
    const a = repo.add({ tmdbId: 1, mediaType: "movie", title: "A", posterPath: null, releaseDate: null });
    const b = repo.add({ tmdbId: 2, mediaType: "movie", title: "B", posterPath: null, releaseDate: null });

    repo.reorderAll([
      { ...a, tier: "S", order: 0 },
      { ...b, tier: "S", order: 1 },
    ]);

    const all = repo.getByKey(1, "movie");
    expect(all?.tier).toBe("S");
    expect(repo.getByKey(2, "movie")?.order).toBe(1);
  });

  describe("export / import", () => {
    it("round-trips through exportRatings / importRatings", () => {
      repo.add({ tmdbId: 603, mediaType: "movie", title: "The Matrix", posterPath: null, releaseDate: "1999-03-30" });
      repo.updateTier(603, "movie", "S");

      const json = repo.exportRatings();
      const fresh = new LocalStorageRepository();
      fresh.clearAll();

      const result = fresh.importRatings(json);
      expect(result.imported).toBe(1);
      expect(fresh.getByKey(603, "movie")?.tier).toBe("S");
    });

    it("merges imported titles with existing ones instead of wiping them", () => {
      repo.add({ tmdbId: 1, mediaType: "movie", title: "Existing", posterPath: null, releaseDate: null });
      const exportOfOther = new LocalStorageRepository();
      // Simulate an export from a different session containing a different title.
      const otherJson = JSON.stringify({
        version: 1,
        titles: [
          {
            tmdbId: 2,
            mediaType: "movie",
            title: "Imported",
            posterPath: null,
            releaseDate: null,
            tier: "Unrated",
            order: 0,
            addedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });
      void exportOfOther;

      repo.importRatings(otherJson);
      expect(repo.getAll().map((t) => t.tmdbId).sort()).toEqual([1, 2]);
    });

    it("throws and changes nothing when the file has no valid titles", () => {
      repo.add({ tmdbId: 1, mediaType: "movie", title: "Existing", posterPath: null, releaseDate: null });
      expect(() => repo.importRatings(JSON.stringify({ nonsense: true }))).toThrow();
      expect(repo.getAll()).toHaveLength(1);
    });

    it("ignores unknown sibling fields like displayDensity added by newer exports", () => {
      const bundleWithDensity = JSON.stringify({
        version: 1,
        exportedAt: Date.now(),
        displayDensity: "compact",
        titles: [
          {
            tmdbId: 9,
            mediaType: "movie",
            title: "New Export Format",
            posterPath: null,
            releaseDate: null,
            tier: "A",
            order: 0,
            addedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });

      const result = repo.importRatings(bundleWithDensity);
      expect(result.imported).toBe(1);
      expect(repo.getByKey(9, "movie")?.tier).toBe("A");
    });

    it("imports titles that predate the optional voteAverage field", () => {
      const legacyBundle = JSON.stringify({
        version: 1,
        titles: [
          {
            tmdbId: 10,
            mediaType: "movie",
            title: "Legacy Title",
            posterPath: null,
            releaseDate: null,
            tier: "B",
            order: 0,
            addedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
      });

      const result = repo.importRatings(legacyBundle);
      expect(result.imported).toBe(1);
      expect(repo.getByKey(10, "movie")?.voteAverage).toBeUndefined();
    });
  });
});
