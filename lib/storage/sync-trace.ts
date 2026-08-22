import {
  trackSyncDecision,
  type SyncOwnerBefore,
  type SyncStoreCount,
} from "@/lib/analytics/events";
import type { LocalOwner } from "@/lib/storage/local-owner";
import type { PullOutcome } from "@/lib/storage/sync-decision";

/**
 * The record of who a board was handed to, and why.
 *
 * A console line does not survive sign-in: the OAuth round trip is several real
 * page loads, and Chrome clears the console on each one unless somebody thought
 * to arm Preserve Log beforehand. Asking a person to catch the decisive moment
 * by hand, between clicks, across reloads, is not a way to find a bug — it is a
 * way to keep not finding one.
 *
 * So the same decision goes three places: the console for whoever is watching
 * live, sessionStorage for whoever looks afterwards (it survives the trip to
 * Google and back within the tab), and the analytics pipeline, so that ordinary
 * use produces the evidence without anyone being asked to reproduce anything.
 */

export const SYNC_TRACE_KEY = "cinetier:sync:trace";

/** Enough to cover a full sign-in, and short enough never to crowd the tab's quota. */
const TRACE_LIMIT = 25;

/** Re-exported so the storage layer need not reach into the analytics module. */
export type TraceCount = SyncStoreCount;

export interface SyncTraceEntry {
  at: number;
  /** The auth event that started this, e.g. INITIAL_SESSION or SIGNED_OUT. */
  authEvent: string;
  userId: string | null;
  /** Ownership as it stood *before* this decision — the field the bug turns on. */
  ownerBefore: OwnerDescription;
  localTitles: number;
  localChannels: number;
  cloudTitles: TraceCount;
  cloudChannels: TraceCount;
  titlesAction: string;
  channelsAction: string;
  /** Present when the sync gave up rather than deciding. */
  reason?: string;
}

export type OwnerDescription = SyncOwnerBefore;

export function describeOwner(owner: LocalOwner | null, userId: string | null): OwnerDescription {
  if (!owner) return "none";
  if (owner.kind === "guest") return "guest";
  if (owner.kind === "unknown") return "unknown";
  return owner.userId === userId ? "same-user" : "other-user";
}

export function describeCount<T>(pull: PullOutcome<T>): TraceCount {
  return pull.status === "ok" ? pull.items.length : "failed";
}

function readTrace(): SyncTraceEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SYNC_TRACE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncTraceEntry[]) : [];
  } catch {
    return [];
  }
}

/** Everything this tab has decided about ownership, oldest first. */
export function readSyncTrace(): SyncTraceEntry[] {
  return readTrace();
}

export function clearSyncTrace(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SYNC_TRACE_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export function recordSyncTrace(entry: Omit<SyncTraceEntry, "at">): void {
  const full: SyncTraceEntry = { at: Date.now(), ...entry };

  console.info("TierListOnline sync:", full);

  if (typeof window !== "undefined") {
    try {
      const next = [...readTrace(), full].slice(-TRACE_LIMIT);
      window.sessionStorage.setItem(SYNC_TRACE_KEY, JSON.stringify(next));
    } catch {
      // A full or blocked sessionStorage costs the after-the-fact copy, not
      // the event below — losing the trace must never break the sync.
    }
  }

  // Reported through the same typed wrapper as the rest of the funnel, so the
  // property names are defined once and a rename is a compile error.
  trackSyncDecision(full);
}
