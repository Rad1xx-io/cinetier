# Sign-in sync at realistic data sizes

**The freeze did not reproduce, and the theorized mechanism is refuted by measurement — but the probe it asked for found a real, previously untested scaling defect somewhere else in the same path.** Both halves of that sentence matter, so both are reported plainly rather than one being dressed up as the other.

**Is the fix general?** Yes. The number of requests is now `O(rows / 100)` for any board — grouping and chunking, not a threshold tuned to make a new test pass. Tests drive it at 20, 200, 350 and 1000 rows.

Evidence vocabulary as usual: **VERIFIED** (measured/executed here) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## Was it scale-related, as theorized?

**No — not on any of the three surfaces the brief named.** Measured before changing anything, with real `localStorage` and boards on both sides:

| surface | measured at realistic size | verdict |
|---|---|---|
| `CloudSyncProvider` event handling (200 local + 200 cloud, every owner combination) | **1 pull, 0 stray pushes, 1 change event** | PR #67's fix holds at scale |
| board mount + the write cascade `reorderAll` sets off | 50 → 19ms · 200 → 4ms · 800 → 16ms · **2000 → 33ms mount, 7ms cascade** | linear and small |
| storage probes per mount, at each of those sizes | **14, constant — not 14·n** | PR #68's cache holds at scale; the feared burst does not materialize |
| `decideSync` with both sides populated | all four actions (`adopt` / `replace` / `discard-local` / `abort`) driven end to end | no branch loops or misbehaves |

So "the same loop as PR #67, just bigger" is **refuted by measurement**, not by argument. That is worth stating positively: the two prior fixes were verified to hold under exactly the conditions that were suspected of breaking them.

## What the probe did find — VERIFIED

The brief's third bullet ("anything in `pushCloudTitles`/`pushCloudChannels` that scales badly with a real payload") was right, and this is the one place where behaviour genuinely changes with size:

```ts
for (const row of staleRows) {
  await supabase.from("ranked_titles").delete()
    .eq("user_id", userId).eq("tmdb_id", row.tmdb_id).eq("media_type", row.media_type);
}
```

**One awaited HTTP round trip per stale row.** Measured against a fake client:

| case | delete requests, before | after |
|---|---|---|
| local 200 replacing a cloud of 200 different rows | **200** | 2 |
| an empty push against a cloud of 200 (what a leaked push does) | **200** | 2 |
| a cloud of 1000 | **1000** | 10 |
| nothing stale | 0 | 0 |

At zero rows this is invisible, which is exactly why every previous test missed it. On a real account it is tens of seconds of strictly serialized requests, with the sync held open for all of them — and it compounded the danger PR #67 dealt with: an accidental empty push did not merely wipe the cloud board, it wiped it one request at a time. Both `lib/storage/cloud-sync.ts` and `lib/storage/youtube/cloud-sync.ts` had it, the channels one being a copy of the titles one, same as the previous two rounds.

## What I could not establish — UNKNOWN, stated plainly

**The reported freeze itself did not reproduce, and its cause is not established.**

Two things keep me from presenting the delete loop as the answer:

1. It is **async I/O**. Two hundred serialized requests make a sync take minutes; they cannot block a content process, and the report is specific that the process was genuinely unresponsive (Firefox's own `Content process … isn't responsive` line, DevTools unable to attach).
2. **The reported scenario does not even reach it.** Signing out of account A and into account B is the `replace` path — cloud has data, local is replaced by it, and nothing is pushed. The delete loop is on `adopt` and on debounced local edits. So in that particular run it never ran.

Calling it the root cause would be forcing the framing, so I am not. It is a real defect, found by the requested probe, fixed on its merits.

**Next diagnostic step, if it recurs** — evidence rather than another theory: `sessionStorage`'s `cinetier:sync:trace` survives the redirects and holds the last 25 sync decisions with their timings; reading it straight after a reproduction says whether the sync even ran. A Firefox performance profile started before the click would say what the main thread was actually doing, which is the one thing none of this harness can observe.

## Changed

- **`lib/storage/cloud-sync.ts`** — stale rows are grouped by `media_type` and deleted with one `in (…)` per group, chunked at 100 ids. Grouping is what keeps the composite key exact: a `tmdb_id` is only ever deleted for its own media type, never across. Errors are now surfaced too — the row-at-a-time version discarded every delete's result.
- **`lib/storage/youtube/cloud-sync.ts`** — same, minus the grouping: its key is one column.
- **Unchanged, deliberately**: `CloudSyncProvider`, `sync-decision.ts`, both stores, both repositories. Nothing in the measurements justified touching them, and PR #67/#68 are not re-litigated here.

## Tests

The coverage gap was "both sides empty", so the new tests are the opposite of that.

- **`__tests__/cloud-sync-scale.test.ts`** (12) — the push paths against real row counts: request count bounded, the *right* rows removed and no others, composite key not collapsed by grouping (a film's id must not delete the series sharing it), every delete scoped to the account, chunking past any URL limit, one `select` rather than one per row, and no delete request at all when nothing is stale.
- **`__tests__/cloud-sync-realistic-boards.test.tsx`** (7) — sign-in driven through the real provider with 200 titles *and* 200 channels on each side: a real cloud board replaces a real local one and pushes nothing back; a real guest board is adopted whole; **a real board belonging to someone else is dropped, not pushed into the arriving account** (the ownership protection, now at a size where getting it wrong would be visible damage); a failed read leaves a full board untouched on both halves; the write notifies readers once per board; and the board does not read as "unavailable" after a large write.

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | **1458 passed**, 117 files (was 1439 — 19 new) |
| `npm run build` | clean |
| `npx playwright test` | 15 passed |

**Negative controls — actually run, then reverted:**

- Restored the row-at-a-time delete loop in the titles push: **4 tests failed**, including the request-count and the composite-key ones.
- Restored it in the channels push: **3 tests failed**.

Both files were confirmed back to their correct state afterwards, and the suite green again.

## On the scoping question

**Agreed, with the scope as recommended.** Three bugs in one subsystem in one evening is a concentration, not a verdict on the rest of the app — and this round is itself evidence for that reading: two of the three suspected surfaces measured clean under the exact conditions thought to break them. A blanket audit would spend most of its effort confirming healthy code.

What this round did expose is the shape of the gap worth closing: **every one of these bugs lived in a case the tests did not represent** — an event kind nobody enumerated (#67), a failure that persisted rather than passed (#68), a row count above zero (this one). So the useful follow-up is not "read everything again" but "test this subsystem against realistic shapes and volumes" across `CloudSyncProvider`, `sync-decision.ts` and both `cloud-sync.ts` files — including the combinations this round only sampled: mixed media types, partial overlaps between local and cloud, and boards an order of magnitude larger. A separate prompt for that, as suggested, rather than folded in here.

## Remaining risks

- **UNKNOWN**: the freeze's actual cause, as above. If it recurs before that is pinned down, the trace plus a profile is what would settle it.
- **INFERRED**: chunk size 100 is a URL-length ceiling, not a measured optimum — chosen so an ordinary board is one request and an extraordinary one is still a handful. If PostgREST ever rejects a chunk, the error now surfaces in the console instead of being discarded, which is how it would be noticed.
