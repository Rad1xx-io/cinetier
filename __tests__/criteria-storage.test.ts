import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageRepository } from "@/lib/storage/local-storage-repository";
import { validateImportedTitles } from "@/lib/storage/validation";
import { criteriaAverage } from "@/lib/types/criteria";
import type { CriterionScore } from "@/lib/types/criteria";

const scores: CriterionScore[] = [
  { criterionId: "story", name: "Сюжет", score: 9 },
  { criterionId: "sound", name: "Звук", score: 8 },
];

function seedTitle(repo: LocalStorageRepository) {
  repo.add({
    tmdbId: 1,
    mediaType: "movie",
    title: "Фильм",
    posterPath: null,
    releaseDate: null,
  });
}

describe("criteriaAverage", () => {
  it("averages the breakdown to one decimal", () => {
    expect(criteriaAverage(scores)).toBe(8.5);
  });

  it("rounds rather than trailing float noise", () => {
    expect(
      criteriaAverage([
        { criterionId: "a", name: "A", score: 7.1 },
        { criterionId: "b", name: "B", score: 7.2 },
        { criterionId: "c", name: "C", score: 7.3 },
      ])
    ).toBe(7.2);
  });

  it("has nothing to report for an absent or empty breakdown", () => {
    expect(criteriaAverage(undefined)).toBeNull();
    expect(criteriaAverage([])).toBeNull();
  });
});

describe("updateCriteria", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    window.localStorage.clear();
    repo = new LocalStorageRepository();
    seedTitle(repo);
  });

  it("attaches a breakdown to the matching title", () => {
    const updated = repo.updateCriteria(1, "movie", scores);
    expect(updated?.criteriaScores).toHaveLength(2);
    expect(repo.getByKey(1, "movie")?.criteriaScores?.[0].name).toBe("Сюжет");
  });

  it("drops the field entirely when the breakdown is cleared", () => {
    repo.updateCriteria(1, "movie", scores);
    repo.updateCriteria(1, "movie", []);

    const stored = repo.getByKey(1, "movie");
    expect(stored).toBeDefined();
    // Absent, not an empty array — exports should not carry a hollow field.
    expect("criteriaScores" in stored!).toBe(false);
  });

  it("leaves other titles untouched", () => {
    repo.add({ tmdbId: 2, mediaType: "movie", title: "Другой", posterPath: null, releaseDate: null });
    repo.updateCriteria(1, "movie", scores);
    expect(repo.getByKey(2, "movie")?.criteriaScores).toBeUndefined();
  });

  it("does not confuse the same id across media types", () => {
    repo.add({ tmdbId: 1, mediaType: "game", title: "Игра", posterPath: null, releaseDate: null });
    repo.updateCriteria(1, "game", scores);

    expect(repo.getByKey(1, "game")?.criteriaScores).toHaveLength(2);
    expect(repo.getByKey(1, "movie")?.criteriaScores).toBeUndefined();
  });
});

describe("import validation", () => {
  it("accepts a title carrying a breakdown", () => {
    const { valid } = validateImportedTitles([
      {
        tmdbId: 1, mediaType: "movie", title: "Ф", posterPath: null, releaseDate: null,
        tier: "S", order: 0, criteriaScores: scores, addedAt: 1, updatedAt: 1,
      },
    ]);
    expect(valid).toHaveLength(1);
  });

  it("rejects a malformed breakdown rather than importing half a record", () => {
    const { valid, invalidCount } = validateImportedTitles([
      {
        tmdbId: 1, mediaType: "movie", title: "Ф", posterPath: null, releaseDate: null,
        tier: "S", order: 0, criteriaScores: [{ criterionId: "x" }], addedAt: 1, updatedAt: 1,
      },
    ]);
    expect(valid).toHaveLength(0);
    expect(invalidCount).toBe(1);
  });

  it("still accepts records saved before criteria existed", () => {
    const { valid } = validateImportedTitles([
      {
        tmdbId: 1, mediaType: "movie", title: "Ф", posterPath: null, releaseDate: null,
        tier: "S", order: 0, addedAt: 1, updatedAt: 1,
      },
    ]);
    expect(valid).toHaveLength(1);
  });
});
