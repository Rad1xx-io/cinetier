"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { TierOrUnrated } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";
import {
  addChannel,
  clearAllChannels,
  exportChannelRatings,
  importChannelRatings,
  removeChannel,
  reorderAllChannels,
  updateChannelTier,
} from "@/lib/storage/youtube";
import type { AddChannelInput } from "@/lib/storage/youtube";
import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
} from "@/lib/storage/youtube/ranked-channels-store";
import { trackListCreationStarted } from "@/lib/analytics/events";

/** Same pattern as useRankedTitles, kept as an independent parallel system for the YouTube-channels category. */
export function useRankedChannels() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const channels: RankedChannel[] = snapshot.status === "ready" ? snapshot.channels : [];
  const hydrated = snapshot.status !== "loading";
  const storageAvailable = snapshot.status !== "unavailable";

  // Same rule as useRankedTitles: the first channel is what starts the list.
  const add = useCallback((input: AddChannelInput) => {
    const before = getSnapshot();
    const startsCatalog = before.status === "ready" && before.channels.length === 0;

    const added = addChannel(input);
    if (startsCatalog) trackListCreationStarted("youtube");
    return added;
  }, []);
  const remove = useCallback((channelId: string) => removeChannel(channelId), []);
  const setTier = useCallback(
    (channelId: string, tier: TierOrUnrated) => updateChannelTier(channelId, tier),
    []
  );

  return {
    channels,
    hydrated,
    storageAvailable,
    add,
    remove,
    setTier,
    reorderAll: reorderAllChannels,
    clearAll: clearAllChannels,
    exportRatings: exportChannelRatings,
    importRatings: importChannelRatings,
  };
}
