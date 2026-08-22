"use client";

/**
 * Whether the board on screen is the one the account actually has.
 *
 * When a cloud read fails the sync deliberately changes nothing — see
 * lib/storage/sync-decision — which leaves the browser showing whatever it
 * held. On a device the account has never used, that is an empty board, and an
 * empty board is indistinguishable from losing everything. This is how the
 * screen gets to say which one it is.
 */

export type SyncState =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "failed"; reason: string };

let current: SyncState = { state: "idle" };
const listeners = new Set<() => void>();
let retryHandler: (() => void) | null = null;

export function getSyncStatus(): SyncState {
  return current;
}

/** Server render has no session and no sync, so it is never anything but idle. */
export function getServerSyncStatus(): SyncState {
  return { state: "idle" };
}

export function subscribeToSyncStatus(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setSyncStatus(next: SyncState): void {
  current = next;
  listeners.forEach((listener) => listener());
}

/** The provider owns the session, so it supplies what "try again" means. */
export function registerSyncRetry(handler: (() => void) | null): void {
  retryHandler = handler;
}

export function retrySync(): void {
  retryHandler?.();
}
