import {
  CATALOG_FILTERS,
  firstStockedCatalog,
  type ContentType,
} from "@/lib/utils/content-type";

/**
 * Which list the board opens on, remembered between visits.
 *
 * Choosing it from what happens to be stocked reads as the board wandering:
 * rank one film and the next visit opens somewhere else, for a reason nobody
 * asked for and nothing on screen explains. A remembered choice is the one
 * answer that is never a surprise — including when it is empty, which is a
 * state the board says out loud rather than quietly avoiding.
 */

/** Named by the feature rather than the module, since it outlives both. */
export const LAST_CATALOG_KEY = "tierlist_last_category";

function isCatalog(value: string): value is ContentType {
  return CATALOG_FILTERS.some((entry) => entry.value === value);
}

/**
 * The remembered list, or null when there is nothing trustworthy to go on.
 *
 * A value that is missing, unreadable, or no longer one of the five is all the
 * same answer: fall back. A catalogue that is dropped in a later version must
 * not strand anyone on a list that no longer exists.
 */
export function readLastCatalog(): ContentType | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LAST_CATALOG_KEY);
    return stored && isCatalog(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function rememberCatalog(value: ContentType): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CATALOG_KEY, value);
  } catch {
    // Somebody browsing with storage blocked gets the fallback every visit,
    // which is the old behaviour rather than a broken one.
  }
}

/**
 * Records a choice only when none has been made.
 *
 * Used where the intent is real but incidental — adding a game says something
 * about which list matters, but not enough to move somebody who has already
 * said it plainly by switching. Overwriting here would mean adding one film
 * from a catalogue page quietly relocates the board somebody was working in.
 */
export function rememberCatalogIfUnset(value: ContentType): void {
  if (readLastCatalog() === null) rememberCatalog(value);
}

/**
 * Which list to open, all of the rules in one place.
 *
 * A remembered choice wins outright, empty or not. Only somebody who has never
 * chosen gets the guess, which is the behaviour this replaced and still the
 * best available answer for a first visit.
 */
export function openingCatalog(counts: Record<ContentType, number>): ContentType {
  return readLastCatalog() ?? firstStockedCatalog(counts);
}
