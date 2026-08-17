"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { MediaType, RankedTitle, TierOrUnrated } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";
import {
  addTitle,
  clearAll,
  exportRatings,
  importRatings,
  removeTitle,
  reorderAll,
  updateTier,
  updateCriteria,
} from "@/lib/storage";
import type { AddTitleInput } from "@/lib/storage";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/storage/ranked-titles-store";
import { trackListCreationStarted } from "@/lib/analytics/events";

/**
 * Reads the ranking list from localStorage via useSyncExternalStore, so it stays
 * in sync across every component mounted in the tab without any effect-driven
 * setState (every write dispatches RANKINGS_CHANGED_EVENT, see ranked-titles-store).
 * The returned mutator functions are stable across renders (useCallback with no
 * deps, since the underlying `lib/storage` functions are module-level bindings)
 * so consumers can safely pass them to React.memo'd children like TierCard.
 */
export function useRankedTitles() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const titles: RankedTitle[] = snapshot.status === "ready" ? snapshot.titles : [];
  const hydrated = snapshot.status !== "loading";
  const storageAvailable = snapshot.status !== "unavailable";

  /*
   * Reported here rather than at the eight screens that add titles, because
   * what makes it a creation is not the click but the board: the first film to
   * arrive starts a film list, the tenth does not. Only this layer knows which
   * one just happened, and only once.
   */
  const add = useCallback((input: AddTitleInput) => {
    const before = getSnapshot();
    const startsCatalog =
      before.status === "ready" &&
      !before.titles.some((title) => title.mediaType === input.mediaType);

    const added = addTitle(input);
    if (startsCatalog) trackListCreationStarted(input.mediaType);
    return added;
  }, []);
  const remove = useCallback(
    (tmdbId: number, mediaType: MediaType) => removeTitle(tmdbId, mediaType),
    []
  );
  const setCriteria = useCallback(
    (tmdbId: number, mediaType: MediaType, criteriaScores: CriterionScore[]) =>
      updateCriteria(tmdbId, mediaType, criteriaScores),
    []
  );
  const setTier = useCallback(
    (tmdbId: number, mediaType: MediaType, tier: TierOrUnrated) =>
      updateTier(tmdbId, mediaType, tier),
    []
  );

  return {
    titles,
    hydrated,
    storageAvailable,
    add,
    remove,
    setTier,
    setCriteria,
    reorderAll,
    clearAll,
    exportRatings,
    importRatings,
  };
}
