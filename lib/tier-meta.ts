import type { TierOrUnrated } from "@/lib/types";

export interface TierMeta {
  name: string;
  description: string;
}

/**
 * Display name and explanation for each tier, shown in the tier list's label
 * column. The names are kept short — the column is barely wide enough for one
 * word on a phone — and the descriptions carry the nuance.
 */
export const TIER_META: Record<TierOrUnrated, TierMeta> = {
  S: { name: "Masterpiece", description: "The best of the best. What I consider outstanding." },
  A: { name: "Great", description: "Very strong — near the top, but not quite there." },
  B: { name: "Good", description: "Well made and genuinely enjoyable." },
  C: { name: "Fine", description: "Has its moments, but nothing special." },
  D: { name: "Weak", description: "Disappointing, or held back by obvious flaws." },
  F: { name: "Bad", description: "Did not like it, or consider it a failure." },
  Unrated: { name: "Unrated", description: "Added to the board but not ranked yet." },
};
