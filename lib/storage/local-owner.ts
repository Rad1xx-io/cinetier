"use client";

/**
 * Who the rankings in this browser belong to.
 *
 * The board lives in localStorage and the cloud only mirrors it, so nothing in
 * the stored data itself said whose it was. Sign-in read "the cloud is empty"
 * as "this must be your own guest board" and pushed whatever was here into the
 * account that had just arrived — which, in a browser where somebody else had
 * been signed in, copied their board into a stranger's account. This marker is
 * the missing half of that decision: not "does this account have data" but
 * "whose data is sitting here".
 */

const OWNER_KEY = "cinetier:rankings:owner";

export type LocalOwner =
  /** Ranked before any account existed here. Safe to adopt on first sign-in. */
  | { kind: "guest" }
  /** Ranked while this account was signed in. */
  | { kind: "user"; userId: string }
  /**
   * Data that predates this marker, found with no session to attribute it to.
   * Deliberately not treated as guest data: an unattributable board is exactly
   * what the leak was made of, and adopting it is the thing being fixed.
   */
  | { kind: "unknown" };

interface StoredOwner {
  userId: string | null;
  stampedAt: number;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readLocalOwner(): LocalOwner | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(OWNER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredOwner;
    if (parsed.userId === null) return { kind: "guest" };
    if (typeof parsed.userId === "string" && parsed.userId) {
      return { kind: "user", userId: parsed.userId };
    }
    return { kind: "unknown" };
  } catch {
    // A corrupt marker is not a licence to adopt.
    return { kind: "unknown" };
  }
}

export function stampLocalOwner(userId: string | null): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(OWNER_KEY, JSON.stringify({ userId, stampedAt: Date.now() } satisfies StoredOwner));
  } catch {
    // Private mode with storage denied — there is no local board to own either.
  }
}

export function clearLocalOwner(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(OWNER_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Settles who owns the board *before* anything can be signed into.
 *
 * Called once on start-up, and deliberately never attributes existing data to
 * a session: after an OAuth redirect a brand-new sign-in arrives as an
 * ordinary page load carrying the new user, so "there is a session, this must
 * be their data" is precisely the inference that copied one board into another
 * account. Data already here with no marker stays `unknown`, which blocks
 * adoption; an empty browser is stamped as a guest, so everything ranked from
 * now on is attributable the moment it is written.
 */
export function ensureLocalOwner(hasLocalData: boolean): LocalOwner {
  const existing = readLocalOwner();
  if (existing) return existing;

  if (!hasLocalData) {
    stampLocalOwner(null);
    return { kind: "guest" };
  }

  return { kind: "unknown" };
}
