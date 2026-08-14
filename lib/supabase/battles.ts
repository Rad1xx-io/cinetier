"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSessionSnapshot } from "@/lib/supabase/session-store";
import { trackEvent } from "@/lib/analytics/tracker";
import { calculateMatchScore } from "@/lib/battle/calculator";
import type {
  BattleCategory,
  BattleComparison,
  BattleItem,
  BattlePayload,
} from "@/lib/types/battle";

/** A battle as the participant sees it: the pool, plus who to credit. */
export interface Battle extends BattlePayload {
  id: string;
  creatorId: string;
  category: BattleCategory;
  createdAt: string;
}

interface BattleRow {
  id: string;
  creator_id: string;
  category: string;
  items: BattleItem[];
  creator_ratings: Record<string, string>;
  created_at: string;
}

const CATEGORIES: BattleCategory[] = ["cinema", "anime", "games", "youtube"];

function isCategory(value: string): value is BattleCategory {
  return (CATEGORIES as string[]).includes(value);
}

function fromRow(row: BattleRow): Battle | null {
  // The column is a plain text check constraint, so a row written by a future
  // migration could carry a category this build has never heard of. Refusing it
  // beats rendering a battle the UI cannot categorise.
  if (!isCategory(row.category)) return null;
  return {
    id: row.id,
    creatorId: row.creator_id,
    category: row.category,
    items: Array.isArray(row.items) ? row.items : [],
    creatorRatings: row.creator_ratings ?? {},
    createdAt: row.created_at,
  };
}

function currentUserId(): string | null {
  const snapshot = getSessionSnapshot();
  return snapshot.status === "signed-in" ? snapshot.user.id : null;
}

/**
 * Stores a battle and returns its id, or null if it could not be created.
 *
 * Creating requires an account — the row is owned by, and deletable by, its
 * creator. Participating does not.
 */
export async function createBattle(
  category: BattleCategory,
  itemsPool: BattleItem[],
  creatorRatings: Record<string, string>
): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const creatorId = currentUserId();
  if (!creatorId) return null;

  const { data, error } = await supabase
    .from("battles")
    .insert({
      creator_id: creatorId,
      category,
      items: itemsPool,
      creator_ratings: creatorRatings,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

/**
 * Fetches a battle by id. Readable by anyone holding the link, signed in or not
 * — that is what makes the invitation work.
 */
export async function getBattle(battleId: string): Promise<Battle | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("battles")
    .select("id,creator_id,category,items,creator_ratings,created_at")
    .eq("id", battleId)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as BattleRow);
}

/**
 * Scores a participant's ratings against the creator's, stores the entry, and
 * returns the comparison for immediate display.
 *
 * The comparison is returned even when the insert fails: the participant
 * finished the round and has earned their result, and losing it because a write
 * did not land would be the worse outcome. Persistence is what the leaderboard
 * needs, not what the player is waiting for.
 */
export async function submitBattleResult(
  battleId: string,
  participantRatings: Record<string, string>
): Promise<BattleComparison | null> {
  const battle = await getBattle(battleId);
  if (!battle) return null;

  const comparison = calculateMatchScore(battle.creatorRatings, participantRatings);

  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const userId = currentUserId();
    await supabase.from("battle_participants").insert({
      battle_id: battleId,
      user_id: userId,
      ratings: participantRatings,
      match_score: comparison.overallMatchPercentage,
    });
  }

  trackEvent("battle_completed", {
    battle_id: battleId,
    category: battle.category,
    match_score: comparison.overallMatchPercentage,
    items_rated: comparison.sharedItemCount,
    items_in_pool: battle.items.length,
  });

  return comparison;
}

/** One person's completed run, as the battle's author sees it. */
export interface BattleEntry {
  id: string;
  userId: string | null;
  matchScore: number;
  itemsRated: number;
  createdAt: string;
}

interface ParticipantRow {
  id: string;
  user_id: string | null;
  ratings: Record<string, string>;
  match_score: number;
  created_at: string;
}

/**
 * Everyone who has finished this battle, best score first.
 *
 * Readable only by the author (and by a signed-in participant, for their own
 * row) — that is enforced by RLS, not here, so a stranger calling this simply
 * gets an empty list rather than an error.
 */
export async function getBattleParticipants(battleId: string): Promise<BattleEntry[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("battle_participants")
    .select("id,user_id,ratings,match_score,created_at")
    .eq("battle_id", battleId)
    .order("match_score", { ascending: false });

  if (error || !data) return [];

  return (data as ParticipantRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    matchScore: row.match_score,
    // Derived rather than stored: the ratings are right there, and a second
    // column would be one more thing that can disagree with them.
    itemsRated: Object.keys(row.ratings ?? {}).length,
    createdAt: row.created_at,
  }));
}
