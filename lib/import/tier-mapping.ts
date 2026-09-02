import { TIERS, type Tier } from "@/lib/types";

/**
 * A rating scale's own values, from best to worst, each naming the tier it
 * lands in. Generic on purpose: Letterboxd's is ten half-star steps, but
 * AniList's 100-point score or MyAnimeList's 10-point one describe the same
 * idea — "here is where my scale's values fall on the app's six tiers" —
 * without this file needing to know which source it is.
 */
export type ScaleTierMap = { value: number; tier: Tier }[];

/**
 * The closest defined value at or below `rating` decides the tier; a rating
 * below every defined value falls to the worst tier rather than throwing,
 * since a source's scale is data, not something this can fully trust.
 */
export function mapRatingToTier(rating: number, scale: ScaleTierMap): Tier {
  const sorted = [...scale].sort((a, b) => b.value - a.value);
  for (const step of sorted) {
    if (rating >= step.value) return step.tier;
  }
  return sorted[sorted.length - 1]?.tier ?? TIERS[TIERS.length - 1];
}

/**
 * Letterboxd rates in half-stars, 0.5 to 5.0 — ten values across six tiers,
 * so two tiers necessarily take a pair each. Split S/A and D/F rather than
 * anywhere in the middle: 4.5 and 5.0 both read as "loved it" the same way
 * 0.5 and 1.0 both read as "actively disliked it", while 3.0 through 4.0 is
 * where a half star is doing the most work distinguishing "good" from
 * "great" and deserves one tier each.
 *
 *   5.0, 4.5 -> S      2.5      -> C
 *   4.0, 3.5 -> A      2.0, 1.5 -> D
 *   3.0      -> B      1.0, 0.5 -> F
 */
export const LETTERBOXD_TIER_MAP: ScaleTierMap = [
  { value: 5.0, tier: "S" },
  { value: 4.5, tier: "S" },
  { value: 4.0, tier: "A" },
  { value: 3.5, tier: "A" },
  { value: 3.0, tier: "B" },
  { value: 2.5, tier: "C" },
  { value: 2.0, tier: "D" },
  { value: 1.5, tier: "D" },
  { value: 1.0, tier: "F" },
  { value: 0.5, tier: "F" },
];

export function letterboxdRatingToTier(rating: number): Tier {
  return mapRatingToTier(rating, LETTERBOXD_TIER_MAP);
}
