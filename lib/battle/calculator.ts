import type { BattleComparison, BattleTier } from "@/lib/types/battle";

/**
 * Tier -> point value. Evenly spaced on purpose: the app presents S-F as a
 * single ladder, so treating an S/A disagreement as the same size as a C/D one
 * is what the UI already promises the user.
 */
export const TIER_VALUES: Record<BattleTier, number> = {
  S: 5,
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};

/** The widest possible disagreement on one item: S against F. */
export const MAX_TIER_GAP = TIER_VALUES.S - TIER_VALUES.F;

/** How many items each of the two highlight lists carries. */
export const TOP_COUNT = 3;

/**
 * Same tier or one step apart counts as agreeing; two steps or more counts as
 * disagreeing. The band between them is deliberate — calling a two-tier gap an
 * "agreement" just because nothing worse happened would flatter the result, and
 * a battle where everyone landed within one tier genuinely has no argument in it.
 */
const AGREEMENT_MAX_GAP = 1;
const DISAGREEMENT_MIN_GAP = 2;

function isTier(value: unknown): value is BattleTier {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TIER_VALUES, value);
}

interface ItemGap {
  itemId: string;
  gap: number;
}

/**
 * Compares two sets of tier ratings into a single match percentage plus the
 * items worth talking about.
 *
 * Only items **both** sides rated take part. An item the participant skipped is
 * not evidence of disagreement, and scoring it as one would punish people for
 * leaving a title blank. Values that are not tiers are dropped for the same
 * reason: ratings arrive from `jsonb`, so a stray or renamed value is a data
 * problem, not a taste signal, and it must not silently move the score.
 *
 * 100% means every shared item matched exactly; 0% means every shared item was
 * as far apart as the ladder allows. When nothing is shared the result is 0 with
 * `sharedItemCount: 0` — check that field before showing the percentage, or a
 * battle with no overlap will read as a battle with opposite taste.
 */
export function calculateMatchScore(
  creatorRatings: Record<string, string>,
  participantRatings: Record<string, string>
): BattleComparison {
  const gaps: ItemGap[] = [];

  for (const [itemId, creatorTier] of Object.entries(creatorRatings ?? {})) {
    const participantTier = participantRatings?.[itemId];
    if (!isTier(creatorTier) || !isTier(participantTier)) continue;
    gaps.push({
      itemId,
      gap: Math.abs(TIER_VALUES[creatorTier] - TIER_VALUES[participantTier]),
    });
  }

  if (gaps.length === 0) {
    return {
      overallMatchPercentage: 0,
      topAgreements: [],
      topDisagreements: [],
      sharedItemCount: 0,
    };
  }

  // Averaged over the shared items rather than summed, so a 20-title battle and
  // a 5-title one produce comparable numbers.
  const totalGap = gaps.reduce((sum, item) => sum + item.gap, 0);
  const overallMatchPercentage = Math.round((1 - totalGap / (gaps.length * MAX_TIER_GAP)) * 100);

  // Ties break on item id so the same two rankings always produce the same
  // lists — otherwise the highlights would shuffle between reloads.
  const byAgreement = [...gaps].sort((a, b) => a.gap - b.gap || a.itemId.localeCompare(b.itemId));
  const byDisagreement = [...gaps].sort(
    (a, b) => b.gap - a.gap || a.itemId.localeCompare(b.itemId)
  );

  return {
    overallMatchPercentage,
    topAgreements: byAgreement
      .filter((item) => item.gap <= AGREEMENT_MAX_GAP)
      .slice(0, TOP_COUNT)
      .map((item) => item.itemId),
    topDisagreements: byDisagreement
      .filter((item) => item.gap >= DISAGREEMENT_MIN_GAP)
      .slice(0, TOP_COUNT)
      .map((item) => item.itemId),
    sharedItemCount: gaps.length,
  };
}
