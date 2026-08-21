import type { LocalOwner } from "@/lib/storage/local-owner";

/**
 * What a cloud read came back with.
 *
 * The distinction that matters is between "this account has nothing stored"
 * and "we could not find out". The old code returned an empty array for both,
 * so a failed request looked exactly like a fresh account — and a fresh
 * account is the one case that pushes local data up.
 */
export type PullOutcome<T> = { status: "ok"; items: T[] } | { status: "failed"; reason: string };

export type SyncAction =
  /** Local data is this user's, and the cloud has nothing yet: send it up. */
  | "adopt"
  /** The cloud has data: it wins, local is replaced by it. */
  | "replace"
  /** Local data belongs to somebody else: drop it, send nothing. */
  | "discard-local"
  /** The read failed: change nothing, in either direction. */
  | "abort";

export interface SyncDecision {
  action: SyncAction;
  /** Kept for the log line, so a support question has an answer. */
  reason: string;
}

/**
 * Decides what a sign-in should do with the board already in this browser.
 *
 * Split out as a pure function because every interesting case here is a
 * combination of three things — who owns the local data, what the cloud said,
 * and whether the read even worked — and those combinations are worth testing
 * without a browser, a session or a network in the way.
 */
export function decideSync<T>(
  owner: LocalOwner,
  pull: PullOutcome<T>,
  localCount: number,
  userId: string
): SyncDecision {
  if (pull.status === "failed") {
    return { action: "abort", reason: `cloud read failed (${pull.reason}); local left untouched` };
  }

  if (pull.items.length > 0) {
    return { action: "replace", reason: "cloud has data; it is the account's own board" };
  }

  if (localCount === 0) {
    return { action: "replace", reason: "nothing anywhere; nothing to decide" };
  }

  if (owner.kind === "guest") {
    return { action: "adopt", reason: "local board was ranked before any account; adopting it" };
  }

  if (owner.kind === "user" && owner.userId === userId) {
    return { action: "adopt", reason: "local board already belongs to this account" };
  }

  if (owner.kind === "user") {
    return {
      action: "discard-local",
      reason: `local board belongs to ${owner.userId}, not ${userId}`,
    };
  }

  return {
    action: "discard-local",
    reason: "local board has no attributable owner; refusing to adopt it",
  };
}
