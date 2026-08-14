"use client";

import { useEffect } from "react";
import type { MediaType } from "@/lib/types";
import type { CriterionScore } from "@/lib/types/criteria";

/**
 * Titles whose breakdown has already been asked for this session.
 *
 * Module-level rather than component state because the details view unmounts
 * between visits: without it, reopening the same card would re-query every
 * time. It also has to remember the *empty* answer — a title with no breakdown
 * in the cloud stores nothing locally, so "absent locally" alone can never tell
 * a first visit from a fruitless second one.
 */
const attempted = new Set<string>();

/** Dropped on sign-out, so the next account does not inherit these answers. */
export function resetLazyCriteriaCache(): void {
  attempted.clear();
}

export interface UseLazyCriteriaOptions {
  tmdbId: number;
  mediaType: MediaType;
  /** Signed-in user id, or null when browsing as a guest. */
  userId: string | null;
  /** True once the item is actually on screen — nothing is fetched for a closed card. */
  isOpen: boolean;
  /** Present locally already; a fetch would be wasted. */
  hasLocalScores: boolean;
  pull: (userId: string, tmdbId: number, mediaType: MediaType) => Promise<CriterionScore[]>;
  onLoaded: (scores: CriterionScore[]) => void;
}

/**
 * Fetches a title's breakdown the first time its card is opened.
 *
 * Runs in the background and writes through `onLoaded`; the card renders
 * immediately either way, because a breakdown is supplementary to the rating
 * rather than part of it.
 */
export function useLazyCriteria({
  tmdbId,
  mediaType,
  userId,
  isOpen,
  hasLocalScores,
  pull,
  onLoaded,
}: UseLazyCriteriaOptions): void {
  useEffect(() => {
    if (!isOpen || !userId || hasLocalScores) return;

    const key = `${userId}:${mediaType}-${tmdbId}`;
    if (attempted.has(key)) return;
    // Marked before the request, not after: two cards mounting in the same tick
    // must not both fire it.
    attempted.add(key);

    let cancelled = false;
    pull(userId, tmdbId, mediaType)
      .then((scores) => {
        // An empty answer is still an answer — `attempted` already records it,
        // and writing nothing locally keeps "no breakdown" meaning exactly that.
        if (!cancelled && scores.length > 0) onLoaded(scores);
      })
      .catch(() => {
        // Let a failed lookup be retried on the next open rather than pretending
        // the title has no breakdown for the rest of the session.
        attempted.delete(key);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, userId, hasLocalScores, tmdbId, mediaType, pull, onLoaded]);
}
