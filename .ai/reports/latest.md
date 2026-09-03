# "Local storage is unavailable" on a client-side navigation

**The lead was half right, and the half it missed is the one that made this visible to a user.** The uncached probe is real and worse than estimated — **18 real `localStorage` write+delete round trips for one `/tier-list` navigation**, measured. But an uncached probe alone cannot produce this symptom: a one-off false would self-heal on the very next read and nobody would ever see the message. The decisive defect is one the lead did not name — **the failure is sticky**. One failed check poisons the store module for the life of the tab, and that is exactly why a full page load works while a client-side navigation does not.

Evidence vocabulary as usual: **VERIFIED** (measured/executed here) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## Is it every click or intermittent? — both, in different halves

Asked first, as instructed. **VERIFIED**: the *onset* is intermittent (it needs one failed availability check, whenever that happens), but the *symptom* is then deterministic — **every client-side navigation shows it, until a full page reload**. It never "recovers on its own", and reloading always appears to fix it, which is precisely the misleading shape the reporter observed.

That falls out of the mechanism: a full load builds these store modules from scratch, a client-side navigation reuses them, and the poison lives in module state.

## Root cause

`lib/storage/ranked-titles-store.ts` (and, identically, `lib/storage/youtube/ranked-channels-store.ts`):

```ts
let cachedSnapshot = LOADING_SNAPSHOT;
let cachedKey = "";

function computeSnapshot() {
  if (!isStorageAvailable()) {
    cachedSnapshot = { status: "unavailable" };   // ← replaces the snapshot
    return cachedSnapshot;                        // ← but leaves cachedKey alone
  }
  const titles = getRatedTitles();
  const key = JSON.stringify(titles);
  if (key !== cachedKey) { cachedKey = key; cachedSnapshot = { status: "ready", titles }; }
  return cachedSnapshot;                          // ← so this hands back the poison
}
```

After one failed check, the next healthy call re-reads the board, serializes it, finds the key **unchanged** (nothing edited it — the UI is showing an error screen), skips the `if`, and returns the cached `unavailable` object. Forever. The only escape is a board content change, which the user cannot perform because the board is what is being hidden.

**VERIFIED by probe, against real `localStorage`, before any change:**

| probe | before | after |
|---|---|---|
| real write+delete probes for one `/tier-list`-shaped mount | **18** | 0–1 |
| one momentary failure, then storage healthy again | `unavailable` → **still `unavailable`**, and a freshly mounted consumer renders the error | recovers to `ready` |
| does a `RANKINGS_CHANGED_EVENT` clear it? | no | n/a |

A secondary defect found in the same read: the unavailable branch allocated a **new object on every call**, which `useSyncExternalStore` compares by identity — a latent re-render loop of exactly the kind PR #67 just dealt with elsewhere. Now a module constant.

## Two corrections to the premise

- **The message is not in the `/tier-list` board.** `Local storage is unavailable…` exists only in `app/page.tsx`. `components/tier-list/tier-list-board.tsx` never destructures `storageAvailable` at all — with a poisoned module it would show its empty/not-hydrated branch instead. So what was on screen was the **dashboard** rendering that string, not the board. (**CODE VERIFIED** — the string appears once in the codebase.)
- **The board does mount several consumers**, which is the part of the lead that held up: it calls both `useRankedTitles` and `useRankedChannels`, and both stores probe independently. That is where the 18 comes from.

## What I could not establish

**UNKNOWN: what made the first check fail.** I could not reproduce a genuine transient `localStorage` failure in a real browser, and jsdom will not show one either — so the origin of the single false is not established, and I would rather say that than dress up a guess. What is now true regardless is that a single false, from any cause, is survivable.

One thing worth flagging as a plausible origin (**INFERRED**): the probe is itself a **write**. In a browser at quota, a pure *read* of the board triggered a write that can throw `QuotaExceededError` — so merely rendering could report "unavailable" without anyone writing anything. That path is now both rarer (one probe per burst instead of 18) and no longer permanent.

## Changed

- **`lib/storage/local-storage-repository.ts`** — the probe's answer is cached for `AVAILABILITY_TTL_MS` (1s), so a navigation's burst shares one round trip. Short on purpose: a browser that genuinely changes its mind is noticed in the next moment, not at the next full reload. Added `markStorageUnavailable()`, and `write()` now catches a throwing `setItem` and calls it — a failed real write is better evidence than any probe, and it means a genuine failure is registered *immediately* rather than waiting for the window to expire. (It also fixes a smaller pre-existing gap: that `setItem` had no `try`/`catch` at all, so a quota error threw uncaught into the caller.)
- **`lib/storage/ranked-titles-store.ts`** — the unavailable branch now clears `cachedKey` (so a later healthy read rebuilds instead of matching a stale key) and returns a single `UNAVAILABLE_SNAPSHOT` constant.
- **`lib/storage/youtube/ranked-channels-store.ts`** — same two changes; it was a copy of the same pattern, so it had the same bug.
- **`lib/storage/youtube/local-storage-repository.ts`** — same `write()` handling. Both repositories already shared one `isStorageAvailable`, so the caching fix covers both by construction.

**Both directions are held down deliberately**: storage that is fine must never read as unavailable, *and* storage that is genuinely gone must still be detected. The second is what stops this from trading a false positive for a permanent false negative.

## Tests

New: `__tests__/storage-availability.test.tsx` (7 tests), driving real `localStorage` with an explicit clock rather than a mocked store, since the point is timing-sensitive behaviour a mock cannot show.

- a `/tier-list`-shaped mount (two titles consumers + a channels consumer) reads as available throughout
- that mount does not re-probe per read (asserts ≤ 1; was 18)
- **a momentary failure with storage healthy again does not leave the board permanently unusable** — the reported bug, asserted on both the store and a freshly mounted consumer
- the same recovery on the channels board
- storage that is genuinely gone is still reported once the cached answer expires
- a failing *real write* reports it immediately, without waiting for that window
- the unavailable snapshot keeps one identity across reads

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | **1439 passed**, 115 files (was 1432 — 7 new) |
| `npm run build` | clean |
| `npx playwright test` | 15 passed |

**Negative controls — actually run, then reverted:**

- Restored the sticky `cachedKey` (kept everything else): **3 tests failed**, including the headline "does not leave the board permanently unusable".
- Removed the probe cache (kept the key fix): **2 tests failed** — the burst count and the immediate write-failure detection.

## Remaining risks

- **UNKNOWN**, as above: the cause of the first failed check. If it recurs, the symptom will now be a brief flash rather than a stuck screen, which is also much harder to notice — worth keeping in mind if a similar report arrives without the "reload fixes it" signature.
- **Deliberate trade-off**: storage becoming unavailable is now noticed up to 1s late on read paths (immediately on write paths). For a local-first board that is not a meaningful window, and it buys the burst reduction.
- Not touched, as instructed: `CloudSyncProvider` / PR #67, and the PostHog/Firefox tracking-protection item.
