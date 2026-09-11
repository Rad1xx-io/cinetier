const VOTER_KEY_STORAGE_KEY = "cinetier:voting:voter-key";

/**
 * Last-resort store for a browser that rejects both localStorage and
 * cookies — same degradation ladder as `lib/analytics/session.ts`'s own
 * storage, kept separate rather than shared because that one carries a TTL
 * this one deliberately does not: a voter_key must outlive a 30-minute idle
 * window, or "did I already vote" would forget the answer mid-ballot.
 */
const memoryStore = new Map<string, string>();

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  } catch {
    // Private mode or storage disabled — fall through to the cookie.
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${key.replace(/[:.]/g, "\\$&")}=([^;]*)`));
  if (match) return decodeURIComponent(match[1]);

  return memoryStore.get(key) ?? null;
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
    return;
  } catch {
    // Fall through.
  }

  try {
    // A year is "effectively forever" for a browser-identity cookie without
    // reaching for Max-Age's own upper bound.
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; Max-Age=31536000; SameSite=Lax`;
    if (document.cookie.includes(key)) return;
  } catch {
    // Fall through.
  }

  memoryStore.set(key, value);
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `vk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * This browser's own opaque id for voting, minted once and reused forever
 * after. Not personal data and not an identity claim — see migration 033's
 * header for exactly what one ballot per (session, voter_key) does and does
 * not defend against. Cleared by clearing site data, a private window, or a
 * second browser, on purpose: the same ceiling Battle's own anonymous
 * participation already accepted, moved one notch, not removed.
 */
export function getVoterKey(): string {
  const existing = readStorage(VOTER_KEY_STORAGE_KEY);
  if (existing) return existing;

  const id = createId();
  writeStorage(VOTER_KEY_STORAGE_KEY, id);
  return id;
}

/**
 * A local memory of "did my own submit already succeed here" — a UX nicety,
 * not the actual defence. `voting_ballots` grants no SELECT to any client
 * (migration 033), so there is no honest way to ask the server "have I
 * voted" without spending a real ballot to find out — and the table is
 * append-only with no DELETE policy for anyone, creator included, so a probe
 * ballot could never be withdrawn afterward if it landed. Recording a
 * successful submit locally instead means a returning voter sees "you
 * already voted" without a wasted round trip, while the real rule — one
 * ballot per (session, voter_key) — still lives entirely server-side and
 * fires on the actual submit attempt regardless of what this says. If this
 * flag and the server ever disagree (storage was cleared, a second browser),
 * the server's unique constraint is what actually decides, not this.
 */
export function markVotedLocally(sessionId: string): void {
  writeStorage(`cinetier:voting:voted:${sessionId}`, "1");
}

export function hasVotedLocally(sessionId: string): boolean {
  return readStorage(`cinetier:voting:voted:${sessionId}`) === "1";
}
