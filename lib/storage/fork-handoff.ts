"use client";

import type { AnalyticsCategory } from "@/lib/analytics/events";
import type { RankedTitle } from "@/lib/types";
import type { RankedChannel } from "@/lib/types/youtube";

/**
 * The two things a fork has to carry across a navigation.
 *
 * Forking happens on `/u/<username>` but lands on `/tier-list`, so the
 * confirmation and the "you started building a list" signal both have to survive
 * a page change. sessionStorage rather than a query string: neither belongs in a
 * URL the user might bookmark or share, and both are meant to be consumed once.
 */
const TOAST_KEY = "cinetier:fork:toast";
const PENDING_KEY = "cinetier:fork:pending";

export interface ForkPending {
  originalListId: string;
  category: AnalyticsCategory;
}

/** Every read and write is best-effort: storage can be unavailable, and a lost
 *  toast must never break the fork that actually succeeded. */
function readAndClear(key: string): string | null {
  try {
    const value = sessionStorage.getItem(key);
    if (value !== null) sessionStorage.removeItem(key);
    return value;
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* nothing to do — the fork itself already landed in localStorage */
  }
}

export function setForkToast(message: string): void {
  write(TOAST_KEY, message);
}

/** Reads the pending confirmation and clears it, so a reload does not repeat it. */
export function takeForkToast(): string | null {
  return readAndClear(TOAST_KEY);
}

/**
 * Arms the `list_creation_started` signal.
 *
 * Reported on the first edit rather than on arrival, because landing on a copied
 * board is not yet building a list — moving something on it is.
 */
export function armForkInteraction(pending: ForkPending): void {
  write(PENDING_KEY, JSON.stringify(pending));
}

/** Consumes the armed signal, or returns null if this edit was not a fork's first. */
export function takeForkInteraction(): ForkPending | null {
  const raw = readAndClear(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ForkPending;
    return parsed.originalListId && parsed.category ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The category a mixed list is best described by — whichever kind it holds most
 * of. `list_creation_started` takes a single category, and a forked board is
 * routinely mixed, so the majority is the only honest single answer.
 */
export function dominantCategory(
  titles: RankedTitle[],
  channels: RankedChannel[] = []
): AnalyticsCategory {
  const counts = new Map<AnalyticsCategory, number>();
  for (const title of titles) {
    const category = title.mediaType as AnalyticsCategory;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  if (channels.length > 0) counts.set("youtube", channels.length);

  let best: AnalyticsCategory = "movie";
  let bestCount = 0;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}
