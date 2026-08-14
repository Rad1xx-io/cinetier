import type { Tier } from "@/lib/types";

/**
 * Taste Battle: a creator freezes a handful of titles plus their own tiers, and
 * anyone with the link rates the same set blind. The two rankings are then
 * compared into a single match percentage.
 */

/**
 * Coarser than the app's `MediaType` on purpose. A battle is a single pool the
 * participant works through in one sitting, and mixing films with series inside
 * one "cinema" round is the intent, not a loss of information — the per-item
 * `MediaType` still lives on whatever the pool was built from.
 *
 * `youtube` is the one category with no `MediaType` behind it at all: channels
 * are a separate store keyed by channel id, so they map straight to a category
 * of their own.
 */
export type BattleCategory = "cinema" | "anime" | "games" | "youtube";

/**
 * A frozen copy of a title, not a reference to one.
 *
 * Battles keep their own snapshot rather than joining back to the catalog: a
 * battle must still render years later when a poster path has rotated, and it
 * must render for a participant with no account and no access to the creator's
 * ranked rows.
 */
export interface BattleItem {
  id: string;
  title: string;
  posterUrl?: string;
  category: BattleCategory;
}

/**
 * Ratings are `string`-valued rather than `Tier`-valued throughout.
 *
 * They cross a JSON boundary — stored as `jsonb`, read back untyped — so a
 * narrower type here would be a claim TypeScript cannot back. The values are
 * validated where it actually matters, in the calculator, which ignores
 * anything that is not a tier. `Record<string, Tier>` is assignable to these
 * fields, so callers that do know the values stay type-safe on the way in.
 */
export interface BattlePayload {
  items: BattleItem[];
  /** itemId -> tier ('S' | 'A' | 'B' | 'C' | 'D' | 'F'). */
  creatorRatings: Record<string, string>;
}

export interface ParticipantResult {
  participantId: string;
  /** Absent for guests: rating a battle deliberately does not require an account. */
  userId?: string;
  /** itemId -> tier, same shape and same caveat as `BattlePayload.creatorRatings`. */
  ratings: Record<string, string>;
  /** 0-100, as returned by `calculateMatchScore`. */
  matchScore: number;
}

export interface BattleComparison {
  overallMatchPercentage: number;
  /** Item ids, best-agreed first. Ids rather than titles — the calculator only ever sees ratings. */
  topAgreements: string[];
  /** Item ids, worst-disagreed first. */
  topDisagreements: string[];
  /**
   * How many items both sides actually rated.
   *
   * Not in the original shape, added because without it 0% is ambiguous: it
   * reads as "opposite taste" but is also what you get when the two people
   * share no rated items at all. A UI that shows a percentage has to be able to
   * tell those apart.
   */
  sharedItemCount: number;
}

/** Battles use the app's rated tiers; "Unrated" has no place in a forced-choice round. */
export type BattleTier = Tier;
