"use client";

import { getRatedChannels } from "@/lib/storage/youtube";
import { CHANNEL_RANKINGS_CHANGED_EVENT } from "@/lib/storage/youtube/local-storage-repository";
import { isStorageAvailable } from "@/lib/storage/local-storage-repository";
import type { RankedChannel } from "@/lib/types/youtube";

export type RankedChannelsSnapshot =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; channels: RankedChannel[] };

const LOADING_SNAPSHOT: RankedChannelsSnapshot = { status: "loading" };

let cachedSnapshot: RankedChannelsSnapshot = LOADING_SNAPSHOT;
let cachedKey = "";

function computeSnapshot(): RankedChannelsSnapshot {
  if (!isStorageAvailable()) {
    cachedSnapshot = { status: "unavailable" };
    return cachedSnapshot;
  }

  const channels = getRatedChannels();
  const key = JSON.stringify(channels);
  if (key !== cachedKey) {
    cachedKey = key;
    cachedSnapshot = { status: "ready", channels };
  }
  return cachedSnapshot;
}

export function getSnapshot(): RankedChannelsSnapshot {
  return computeSnapshot();
}

export function getServerSnapshot(): RankedChannelsSnapshot {
  return LOADING_SNAPSHOT;
}

export function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANNEL_RANKINGS_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANNEL_RANKINGS_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
