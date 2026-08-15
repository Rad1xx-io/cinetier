import type { MediaType, RankedTitle } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";
import type { AddTitleInput, RankingRepository } from "@/lib/storage/repository";
import { titleKey } from "@/lib/storage/repository";
import { validateImportedTitles } from "@/lib/storage/validation";

const STORAGE_KEY = "cinetier:rankings:v1";

/** Fired on `window` whenever the underlying data changes, so any mounted hook can resync. */
export const RANKINGS_CHANGED_EVENT = "cinetier:rankings-changed";

export function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__tierlistonline_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function notifyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(RANKINGS_CHANGED_EVENT));
  }
}

export class LocalStorageRepository implements RankingRepository {
  private readCache(): RankedTitle[] {
    if (!isStorageAvailable()) return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const { valid } = validateImportedTitles(parsed);
      return valid;
    } catch {
      return [];
    }
  }

  private write(titles: RankedTitle[]) {
    if (!isStorageAvailable()) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(titles));
    notifyChanged();
  }

  getAll(): RankedTitle[] {
    return this.readCache().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getByKey(tmdbId: number, mediaType: MediaType): RankedTitle | undefined {
    return this.readCache().find(
      (t) => titleKey(t.tmdbId, t.mediaType) === titleKey(tmdbId, mediaType)
    );
  }

  add(input: AddTitleInput): RankedTitle {
    const titles = this.readCache();
    const existing = titles.find(
      (t) => titleKey(t.tmdbId, t.mediaType) === titleKey(input.tmdbId, input.mediaType)
    );
    if (existing) return existing;

    const now = Date.now();
    const targetTier = input.tier ?? "Unrated";
    const maxOrder = titles
      .filter((t) => t.tier === targetTier)
      .reduce((max, t) => Math.max(max, t.order), -1);
    const record: RankedTitle = {
      tmdbId: input.tmdbId,
      mediaType: input.mediaType,
      title: input.title,
      posterPath: input.posterPath,
      releaseDate: input.releaseDate,
      tier: targetTier,
      order: maxOrder + 1,
      voteAverage: input.voteAverage,
      addedAt: now,
      updatedAt: now,
    };
    this.write([...titles, record]);
    return record;
  }

  remove(tmdbId: number, mediaType: MediaType): void {
    const titles = this.readCache();
    this.write(
      titles.filter((t) => titleKey(t.tmdbId, t.mediaType) !== titleKey(tmdbId, mediaType))
    );
  }

  updateTier(
    tmdbId: number,
    mediaType: MediaType,
    tier: RankedTitle["tier"]
  ): RankedTitle | undefined {
    const titles = this.readCache();
    const maxOrder = titles
      .filter((t) => t.tier === tier)
      .reduce((max, t) => Math.max(max, t.order), -1);
    let updated: RankedTitle | undefined;
    const next = titles.map((t) => {
      if (titleKey(t.tmdbId, t.mediaType) === titleKey(tmdbId, mediaType)) {
        updated = { ...t, tier, order: maxOrder + 1, updatedAt: Date.now() };
        return updated;
      }
      return t;
    });
    this.write(next);
    return updated;
  }

  updateCriteria(
    tmdbId: number,
    mediaType: MediaType,
    criteriaScores: CriterionScore[]
  ): RankedTitle | undefined {
    const titles = this.readCache();
    let updated: RankedTitle | undefined;

    const next = titles.map((t) => {
      if (titleKey(t.tmdbId, t.mediaType) !== titleKey(tmdbId, mediaType)) return t;
      // An empty list means "no breakdown" rather than "a breakdown of nothing",
      // so the field goes away entirely and exports stay clean.
      const rest = { ...t };
      delete rest.criteriaScores;
      updated =
        criteriaScores.length > 0
          ? { ...rest, criteriaScores, updatedAt: Date.now() }
          : { ...rest, updatedAt: Date.now() };
      return updated;
    });

    this.write(next);
    return updated;
  }

  reorderAll(titles: RankedTitle[]): void {
    this.write(titles);
  }

  clearAll(): void {
    this.write([]);
  }

  exportRatings(): string {
    return JSON.stringify(
      { version: 1, exportedAt: Date.now(), titles: this.readCache() },
      null,
      2
    );
  }

  importRatings(json: string): { imported: number } {
    const parsed = JSON.parse(json);
    const { valid } = validateImportedTitles(parsed);
    if (valid.length === 0) {
      throw new Error("No valid ranked titles found in the file.");
    }

    const existing = this.readCache();
    const merged = new Map<string, RankedTitle>();
    for (const t of existing) merged.set(titleKey(t.tmdbId, t.mediaType), t);
    for (const t of valid) merged.set(titleKey(t.tmdbId, t.mediaType), t);

    this.write(Array.from(merged.values()));
    return { imported: valid.length };
  }
}

export const localStorageRepository = new LocalStorageRepository();
