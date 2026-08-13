import type { RankedChannel } from "@/lib/types/youtube";
import { isValidTier } from "@/lib/storage/validation";

export function isRankedChannel(value: unknown): value is RankedChannel {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.channelId === "string" &&
    v.channelId.length > 0 &&
    typeof v.title === "string" &&
    (v.thumbnailUrl === null || typeof v.thumbnailUrl === "string") &&
    (v.country === null || typeof v.country === "string") &&
    isValidTier(v.tier) &&
    typeof v.order === "number" &&
    (v.subscriberCount === undefined || typeof v.subscriberCount === "number") &&
    typeof v.addedAt === "number" &&
    typeof v.updatedAt === "number"
  );
}

export interface ImportValidationResult {
  valid: RankedChannel[];
  invalidCount: number;
}

export function validateImportedChannels(data: unknown): ImportValidationResult {
  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { channels?: unknown[] })?.channels)
      ? (data as { channels: unknown[] }).channels
      : [];

  const valid: RankedChannel[] = [];
  let invalidCount = 0;

  for (const item of list) {
    if (isRankedChannel(item)) {
      valid.push(item);
    } else {
      invalidCount += 1;
    }
  }

  return { valid, invalidCount };
}
