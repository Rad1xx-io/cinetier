"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSessionSnapshot } from "@/lib/supabase/session-store";
import { getVoterKey, markVotedLocally } from "@/lib/voting/voter-key";
import type {
  CloseSessionResult,
  SubmitBallotResult,
  VotingCategory,
  VotingPoolItem,
  VotingRatings,
  VotingSession,
} from "@/lib/types/voting";

interface VotingSessionRow {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  category: string;
  pool: VotingPoolItem[];
  closed_at: string | null;
  result_post_id: string | null;
  created_at: string;
}

const CATEGORIES: VotingCategory[] = ["movie", "tv", "anime", "game", "mixed"];

function isCategory(value: string): value is VotingCategory {
  return (CATEGORIES as string[]).includes(value);
}

function fromRow(row: VotingSessionRow): VotingSession | null {
  // Same defence as Battle's fromRow: a plain text check constraint means a
  // future migration could write a category this build has never heard of.
  if (!isCategory(row.category)) return null;
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    category: row.category,
    pool: Array.isArray(row.pool) ? row.pool : [],
    closedAt: row.closed_at,
    resultPostId: row.result_post_id,
    createdAt: row.created_at,
  };
}

function currentUserId(): string | null {
  const snapshot = getSessionSnapshot();
  return snapshot.status === "signed-in" ? snapshot.user.id : null;
}

/**
 * Stores a voting session and returns its id, or null if it could not be
 * created. Creating requires an account, same as Battle — the row is owned
 * by, and deletable by, its creator. Voting in it does not.
 */
export async function createVotingSession(input: {
  title: string;
  description: string;
  category: VotingCategory;
  pool: VotingPoolItem[];
}): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const creatorId = currentUserId();
  if (!creatorId) return null;

  const { data, error } = await supabase
    .from("voting_sessions")
    .insert({
      creator_id: creatorId,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      pool: input.pool,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("TierListOnline: creating a voting session failed —", error);
    return null;
  }
  return (data as { id: string }).id;
}

/**
 * Fetches a session by id. Readable by anyone holding the link, signed in or
 * not — same as Battle, and for the same reason: the link is the invitation.
 */
export async function getVotingSession(sessionId: string): Promise<VotingSession | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("voting_sessions")
    .select("id,creator_id,title,description,category,pool,closed_at,result_post_id,created_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return null;
  return fromRow(data as VotingSessionRow);
}

/**
 * Submits one browser's ballot. `voter_key` is this browser's own, minted
 * once and reused — see `lib/voting/voter-key.ts` and migration 033's header
 * for what it does and does not defend against. A second submission from the
 * same browser in the same session is not an error to surface as "something
 * went wrong" — it is the one rule this feature actually enforces, so it
 * gets its own outcome rather than falling into "unknown".
 */
export async function submitBallot(
  sessionId: string,
  ratings: VotingRatings
): Promise<SubmitBallotResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const userId = currentUserId();
  const voterKey = getVoterKey();

  const { error } = await supabase.from("voting_ballots").insert({
    session_id: sessionId,
    user_id: userId,
    voter_key: voterKey,
    ratings,
  });

  if (!error) {
    markVotedLocally(sessionId);
    return { ok: true };
  }

  if (error.code === "23505") return { ok: false, reason: "already-voted" };
  // RLS refuses the insert outright once a session is closed, rather than a
  // named error — anything that is not the unique violation above, while the
  // session itself has since closed, is read as that rather than "unknown".
  const session = await getVotingSession(sessionId);
  if (session?.closedAt) return { ok: false, reason: "closed" };

  console.error("TierListOnline: submitting a ballot failed —", error);
  return { ok: false, reason: "unknown" };
}

/**
 * Closes a session: aggregates every ballot and freezes the result as an
 * ordinary post, atomically, server-side — see `close_voting_session` in
 * migration 033 for why this is one RPC rather than client-orchestrated
 * reads and writes the way `publishPost` gets away with for a single author.
 */
export async function closeVotingSession(sessionId: string): Promise<CloseSessionResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ok: false, reason: "not-configured" };

  const { data, error } = await supabase.rpc("close_voting_session", { p_session_id: sessionId });

  if (error) {
    if (error.message.includes("Only the creator")) return { ok: false, reason: "not-creator" };
    if (error.message.includes("already closed")) return { ok: false, reason: "already-closed" };
    console.error("TierListOnline: closing a voting session failed —", error);
    return { ok: false, reason: "unknown" };
  }

  return { ok: true, postId: data as string };
}
