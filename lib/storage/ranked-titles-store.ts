"use client";

import { getRatedTitles } from "@/lib/storage";
import { RANKINGS_CHANGED_EVENT, isStorageAvailable } from "@/lib/storage/local-storage-repository";
import type { RankedTitle } from "@/lib/types";

export type RankedTitlesSnapshot =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; titles: RankedTitle[] };

const LOADING_SNAPSHOT: RankedTitlesSnapshot = { status: "loading" };
/** One object, not a fresh one per call — `useSyncExternalStore` compares by identity. */
const UNAVAILABLE_SNAPSHOT: RankedTitlesSnapshot = { status: "unavailable" };

let cachedSnapshot: RankedTitlesSnapshot = LOADING_SNAPSHOT;
/** `null` means nothing valid is cached — never a key any board could serialize to. */
let cachedKey: string | null = null;

/**
 * Backs `useSyncExternalStore` in useRankedTitles. Re-reads localStorage on every
 * call (cheap for this dataset size) but only allocates a new object when the
 * serialized content actually changed, so React doesn't see a "new" snapshot
 * — and therefore doesn't re-render — on every unrelated call.
 *
 * The unavailable branch clears the key as well, and that is the whole point.
 * It used to leave it alone, so a single failed availability check poisoned
 * this module: the next call found storage healthy, serialized the same
 * unchanged board, matched the old key, and handed back the "unavailable"
 * snapshot it had cached — for the life of the tab. A full page load looked
 * fine because it built this module from scratch; every client-side
 * navigation afterwards read the poison. One momentary failure is a blank
 * screen either way, but it must not be a permanent one.
 */
function computeSnapshot(): RankedTitlesSnapshot {
  if (!isStorageAvailable()) {
    cachedKey = null;
    cachedSnapshot = UNAVAILABLE_SNAPSHOT;
    return cachedSnapshot;
  }

  const titles = getRatedTitles();
  const key = JSON.stringify(titles);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSnapshot = { status: "ready", titles };
  }
  return cachedSnapshot;
}

export function getSnapshot(): RankedTitlesSnapshot {
  return computeSnapshot();
}

export function getServerSnapshot(): RankedTitlesSnapshot {
  return LOADING_SNAPSHOT;
}

export function subscribe(callback: () => void): () => void {
  window.addEventListener(RANKINGS_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(RANKINGS_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
