"use client";

import { getRatedTitles } from "@/lib/storage";
import { RANKINGS_CHANGED_EVENT, isStorageAvailable } from "@/lib/storage/local-storage-repository";
import type { RankedTitle } from "@/lib/types";

export type RankedTitlesSnapshot =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; titles: RankedTitle[] };

const LOADING_SNAPSHOT: RankedTitlesSnapshot = { status: "loading" };

let cachedSnapshot: RankedTitlesSnapshot = LOADING_SNAPSHOT;
let cachedKey = "";

/**
 * Backs `useSyncExternalStore` in useRankedTitles. Re-reads localStorage on every
 * call (cheap for this dataset size) but only allocates a new object when the
 * serialized content actually changed, so React doesn't see a "new" snapshot
 * — and therefore doesn't re-render — on every unrelated call.
 */
function computeSnapshot(): RankedTitlesSnapshot {
  if (!isStorageAvailable()) {
    cachedSnapshot = { status: "unavailable" };
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
