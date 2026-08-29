# Publish post: category now actually scopes the snapshot

No screenshots this round — no UI changed, only what data gets sent when the existing
Publish button is clicked. `.ai/reports/shots/` cleared of the previous round's images
per the convention.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## What changed

### The bug

`components/feed/publish-post-dialog.tsx`'s category picker (`CATEGORY_OPTIONS`) changed
what button showed as pressed, but `handleSubmit` always passed the full, unfiltered
`titles` prop straight to `publishPost()` — the picked category was stored as a label on
the post row and never actually filtered what got snapshotted into it. The same class of
bug already found and fixed for Clear List in `components/tier-list/tier-list-actions.tsx`
(see the comment above `clearableCount`): a picker that changes what is shown on screen but
never reaches the call that acts on it.

### The fix

`handleSubmit` now computes the snapshot before calling `publishPost`:

```ts
const snapshotTitles =
  category === "mixed" ? titles : titles.filter((t) => t.mediaType === category);
```

"Everything" (`mixed`) is the one option meant to keep the whole board; every other
button now snapshots only its own catalog, matching what is actually highlighted when
Publish is clicked.

### Deliberately not touched: the "YouTube" category

`PublishPostDialog` has no `channels` prop, and `RankedTitle.mediaType` is
`"movie" | "tv" | "anime" | "game"` — it never contains `"youtube"` (`lib/types/index.ts`).
So filtering by `t.mediaType === "youtube"` snapshots an **empty** list, same as before this
fix in effect (a "YouTube" post never actually contained real channels either way — it
previously snapshotted the whole unrelated board instead). This is an honest empty
snapshot now rather than a wrong full one, not a new regression, but actually wiring
channels into a YouTube post is a separate, out-of-scope change (`tier-list-actions.tsx`
already threads `channels` through for Clear List and Battle — `PublishPostDialog` would
need the same prop, plus `publishPost` would need to accept and store them). Logged in
`.ai/DECISIONS.md`, not fixed here without a separate request.

## Verified

- `npm run lint` — clean (1 pre-existing unrelated warning in `__tests__/post-delete.test.tsx`)
- `npm run typecheck` — clean
- `npm test` — 938/938 passing, including 3 new tests in `__tests__/publish-post-dialog.test.tsx`:
  - scopes the snapshot to the picked category, not the whole board
  - keeps the whole board when the category is Everything
  - re-scopes the snapshot when the category is changed before submit (picker touched after
    open, not just the `suggestedCategory` default)
- **Negative control**: reverted the fix locally and re-ran the suite — exactly the 2 new
  filtering assertions failed (full unfiltered `titles` sent regardless of category), the
  other 13 in the file still passed. Confirms the tests actually catch the bug rather than
  passing vacuously.
- `npx playwright test` — 13/13 passing (no new spec needed — this is a data-shape change
  at the `publishPost` call boundary, already covered by the unit test above; no dialog
  markup changed)
- `npm run build` — clean

## Follow-up needed after this merges

Rad1xx's "Best Anime 2026" post was already recreated once with the old, unfixed logic and
is still wrong (full board, not just anime). It needs one more **Delete Post + Publish** on
the live site after this PR merges — the snapshot is taken once at Publish time and does not
retroactively correct itself.
