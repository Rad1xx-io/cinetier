import type { RankedTitle, TierOrUnrated } from "@/lib/types";

const VALID_TIERS: TierOrUnrated[] = ["S", "A", "B", "C", "D", "F", "Unrated"];

export function isValidTier(value: unknown): value is TierOrUnrated {
  return typeof value === "string" && (VALID_TIERS as string[]).includes(value);
}

export function isRankedTitle(value: unknown): value is RankedTitle {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.tmdbId === "number" &&
    (v.mediaType === "movie" ||
      v.mediaType === "tv" ||
      v.mediaType === "anime" ||
      v.mediaType === "game") &&
    typeof v.title === "string" &&
    (v.posterPath === null || typeof v.posterPath === "string") &&
    (v.releaseDate === null || typeof v.releaseDate === "string") &&
    isValidTier(v.tier) &&
    typeof v.order === "number" &&
    (v.voteAverage === undefined || typeof v.voteAverage === "number") &&
    typeof v.addedAt === "number" &&
    typeof v.updatedAt === "number"
  );
}

export interface ImportValidationResult {
  valid: RankedTitle[];
  invalidCount: number;
}

/** Validates an arbitrary parsed JSON value as an array of RankedTitle records. */
export function validateImportedTitles(data: unknown): ImportValidationResult {
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { titles?: unknown[] })?.titles)
      ? (data as { titles: unknown[] }).titles
      : [];

  const valid: RankedTitle[] = [];
  let invalidCount = 0;

  for (const item of list) {
    if (isRankedTitle(item)) {
      valid.push(item);
    } else {
      invalidCount += 1;
    }
  }

  return { valid, invalidCount };
}
