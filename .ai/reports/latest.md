# Sign-in freeze: the cloud sync ran on every auth notification, and its own reads produced more of them

**The theory in the report was right about the component and wrong about the loop.** It is `CloudSyncProvider` (`components/auth/cloud-sync-provider.tsx`) — the thing that prints `TierListOnline sync:` and calls `trackSyncDecision`. But the mechanism is not the one guessed: `reorderAll` firing `RANKINGS_CHANGED_EVENT` into the provider's own push listener is, on its own, correctly guarded. The loop is one level up, in what the provider treats as a reason to sync at all, and it closes through `@supabase/auth-js` rather than through localStorage.

Evidence vocabulary as usual: **VERIFIED** (measured/executed here) · **CODE VERIFIED** (read from installed source) · **INFERRED** · **UNKNOWN**.

## Root cause

Two facts, both **CODE VERIFIED** by reading the installed `@supabase/auth-js` and `@supabase/supabase-js`, not from documentation:

1. **`onAuthStateChange` is not a sign-in notification.** `_recoverAndRefresh()` re-emits `SIGNED_IN` for any valid stored session, with no comparison against what it last reported (`GoTrueClient.js`, the `else` branch that ends `await this._notifyAllSubscribers('SIGNED_IN', currentSession)`). `_onVisibilityChanged()` calls it every time the tab becomes visible. So `SIGNED_IN` arrives on **every return to the tab**, not once per sign-in — and `TOKEN_REFRESHED` / `USER_UPDATED` arrive the same way.

2. **A sync's own reads can produce auth events.** Every PostgREST request fetches its token through `_getAccessToken()` → `auth.getSession()` (`supabase-js/dist/index.cjs`), and `getSession()` calls `_callRefreshToken()` when the token is inside its expiry margin, which ends in `await this._notifyAllSubscribers('TOKEN_REFRESHED', data.session)`.

The provider closed the circuit between them. Its listener was:

```ts
if (session?.user) { userIdRef.current = session.user.id; void syncDown(session.user.id, event); }
```

Every event — any kind, any repeat, same account or not — started a full `syncDown`: six potential cloud reads (2 stores × 3 retry attempts), a rewrite of both boards, a `sessionStorage` trace write and a PostHog event. Those reads could emit `TOKEN_REFRESHED`, which started another `syncDown`, whose reads could emit again. Each pass also calls `reorderAll`, which dispatches `RANKINGS_CHANGED_EVENT` **synchronously**, re-rendering every mounted hook that reads the boards — and each of those re-renders re-parses, re-sorts and re-serializes localStorage in `computeSnapshot()`. That is why the failure presents as a pegged main thread rather than merely noisy network traffic, and why it happens with zero rankings: nothing here scales with the data, only with the number of passes.

**VERIFIED by measurement**, before any change, driving the real component:

| probe | before the fix | after |
|---|---|---|
| pulls after `INITIAL_SESSION`, `SIGNED_IN`, `TOKEN_REFRESHED`, `USER_UPDATED` (one each) | 1 → 2 → 3 → 4 | 1 → 1 → 1 → 1 |
| one seed `SIGNED_IN`, where each read emits `TOKEN_REFRESHED` as the SDK does | **41 pulls**, and only because the harness capped the emitting at 40 | 1 |
| the reported `INITIAL_SESSION` + `SIGNED_IN` pair | 2 pulls **and 1 push of an empty board** | 1 pull, 0 pushes |

### The second defect, found by the same probe

`syncingDownRef` is a single boolean shared by every run, and it is what stops a sync's own `reorderAll` from being mistaken for a user edit and pushed back up. Two overlapping runs break it: the first to reach its `finally` clears the flag while the second is still writing, so the second write escapes the guard and schedules `pushCloudTitles(userId, <board as it stands>)`.

On a fresh sign-in that board is empty at that moment — and `pushCloudTitles` **deletes every cloud row absent from what it is handed**. So the leaked push is not a wasted request, it is a wipe of that account's saved rankings. The reported console (`INITIAL_SESSION` then `SIGNED_IN`, back to back) is exactly the sequence that triggers it, so this fired on **every** fresh sign-in, silently. The reporter's own trace shows `cloudTitles: 0`, so nothing was lost in their case — there was nothing there to lose.

This is **VERIFIED**, not deduced: the probe recorded `pushes: 1, pushArgs: [0]` on that two-event sequence before the fix, and `pushes: 0` after.

## Changed

Only `components/auth/cloud-sync-provider.tsx`.

- **Sync on a change of account, not on a notification.** The listener now keeps `syncedUserRef` and returns early when an event names an account already reconciled in this mount. That cuts the feedback loop at its root: an event caused by the sync's own reads is, by definition, about the account the sync is already running for.
- **A different account still syncs immediately** — that is the case the ownership marker and the whole `local-owner` design exist for, and it must not be deduplicated away. Signing out clears `syncedUserRef`, so signing back in as the same account reconciles again (the board went with the session, so there is nothing left for a repeat id to stand for).
- **Syncs are serialized.** `queueSync()` chains each run behind the one in flight instead of letting them interleave, which removes the overlap the `syncingDownRef` boolean cannot survive. An explicit "Try again" still forces a run — the gate is about repeated notifications, not repeated intent — and now queues rather than racing.

Deliberately unchanged: `syncDown`'s own logic, `decideSync`, `local-owner`, the trace, the retry/backoff policy, and every route, migration and auth surface. Nothing here touches `/auth/callback`, `app/api/auth/*` or `app/api/account/*`.

## The secondary symptom

The first reproduction — the account dropdown working while the rest of the page ignored clicks — is **INFERRED**, not reproduced here. It is consistent with a main thread saturated by the storm: the header's menu is a Radix portal whose open/close is driven by pointer events on an already-painted subtree, while everything else on the page depends on React committing renders that never got a turn. I could not confirm that distribution without the reporter's tab, and I would rather say so than assert a tidy explanation. The fix removes the saturation, which is what both symptoms hang off.

## Tests

New: `__tests__/cloud-sync-auth-storm.test.tsx` (10 tests). It uses a fake client that supports **multiple** subscribers, unlike the older replay suite's single-callback fake — the real client has both this provider and the session store attached.

- a sync whose reads emit `TOKEN_REFRESHED` does not cascade (the freeze itself), and stays finished afterwards
- `SIGNED_IN` re-emitted on tab focus, and `TOKEN_REFRESHED` / `USER_UPDATED`, do not re-sync
- the `INITIAL_SESSION` + `SIGNED_IN` pair runs one sync, not two
- **no empty push on a fresh sign-in**, asserted against a non-empty cloud board so the test fails loudly if the wipe returns
- a different account still syncs; the same account after a sign-out still syncs; an explicit retry still runs
- two syncs that overlap in time run one after the other, never interleaved

The cascade test is capped at 50 emissions on purpose: uncapped, the unfixed provider recurses until the runner gives up, and a test that fails by counting says more than one that fails by hanging.

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | **1432 passed**, 114 files (was 1422 — 10 new) |
| `npm run build` | clean |
| `npx playwright test` | 15 passed |

**Negative controls — actually run, then reverted:**

- Removed the identity gate (sync on every event again): **5 tests failed**, including both cascade tests and the "one sync, not two" test. Restored, suite green again.
- Removed the serialization (ran `syncDown` directly instead of chaining): **the overlap test failed**, precisely and only that one. Restored, suite green again.
- The 17 pre-existing tests in `cloud-sync-provider.test.tsx` and `auth-flow-replay.test.tsx` — the account-switch and ownership-ordering coverage that guards the board-leak fix — pass unchanged throughout, which is the check that mattered most while adding a gate to the auth listener.

## Out of scope, as instructed — and not entangled

The PostHog issue (Firefox ETP blocking `eu-assets.i.posthog.com`, plus the Report-Only CSP mismatch) is untouched. I looked specifically for a connection, since `recordSyncTrace` ends in a PostHog capture on every sync pass: a blocked analytics asset does not start or sustain this loop, and the loop's own volume is what would have made those captures conspicuous. **INFERRED** — PostHog amplified the visibility of the problem, not the problem.

## Remaining risks

- **UNKNOWN**: whether any real account lost cloud rankings to the empty push before this fix. It required a non-empty cloud board plus the overlap window, and it would look like "my rankings disappeared after signing in" rather than an error. If Denis has Supabase logs, a burst of `DELETE /rest/v1/ranked_titles` immediately after a sign-in is the signature. Not checkable from here.
- **Deliberate behaviour change, stated rather than buried**: the app no longer re-pulls from the cloud on every tab focus. That re-pull was never a designed feature — it was the SDK re-emitting `SIGNED_IN` — but if a board edited on another device should appear on focus, that is a *new* feature to design with its own throttle, not something to restore by removing this gate.
- **CODE VERIFIED, not runtime-verified against the live SDK**: the two SDK behaviours above are read from the installed `@supabase/auth-js` / `@supabase/supabase-js` in `node_modules`, and reproduced in the harness by simulating them faithfully. This environment cannot reach the real Supabase project (`TypeError: fetch failed`, the same restriction documented in earlier reports this session), so the end-to-end sequence was not observed against real servers. The fix does not depend on the exact emission conditions, only on the provider no longer treating repeat notifications as work.
