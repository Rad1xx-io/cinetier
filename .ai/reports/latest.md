# Feed post dialog: the "whole board" fetch bypassed the snapshot

No new screenshot files in `.ai/reports/shots/` this round (cleared, still empty) — the
visual proof here came from a live reproduction against real production data on a local
dev server (see "How this was verified" below), not from a Playwright spec, since the
bug only shows up once a real author's live board diverges from a real post's snapshot.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## The report

Rad1xx's "Best Anime 2026" post (already flagged in `.ai/DECISIONS.md` as needing one more
Delete Post + Publish after the category-scoping fix) was recreated after that fix shipped.
The feed card correctly showed only anime. Opening the post's dialog showed 66 titles across
6 tiers, including at least one game.

## Root cause, confirmed against real data before touching any code

Queried Supabase directly (REST, the same public anon key the client itself uses) rather than
guessing from the source:

- `ranked_title_publications` for this post: **16 rows, every one `mediaType: "anime"`.** The
  category-scoping fix worked — the snapshot itself was never the problem.
- `ranked_titles` for the author: **66 rows — 49 game, 16 anime, 1 movie, 6 tiers.** Exactly
  the numbers the dialog was showing.

So the dialog wasn't rendering a stale or wrong snapshot — it was rendering the author's
*entire current live board*, unrelated to which post was open.

`components/feed/post-dialog.tsx` fetches a second, larger batch on open —
`getAuthorTitles([post.userId], FULL_BOARD_CAP)` — meant to cover authors with more than the
40-per-author cap the feed's own batched query uses for cards, so a post's snapshot doesn't
silently lose an entry that fell outside that cap. Once that fetch resolved, it was rendered
directly (`buildTierRows(fullTitles ?? titles)`) — never passed through `resolveSnapshotTitles`
the way `feed-view.tsx`'s own `titlesForPost` already does for the initial slice. The bigger
fetch is *the author's whole board*, not the post's — so once it landed, the dialog quietly
stopped showing what this post actually froze and started showing everything the author has
ever ranked, mixed categories and all. This is not specific to this one post: it affects the
dialog for any post by any author who has ranked anything at all, since the fetch almost never
comes back empty.

Checked for sibling instances first: `getAuthorTitles` is called in exactly two places in the
app — `feed-view.tsx` (already correct) and `post-dialog.tsx` (this bug). No other spot needed
the same fix.

## The fix

- `PostDialog` gained a `snapshot?: RankedTitleSnapshotEntry[]` prop — the same value
  `feed-view.tsx` already reads from `getPostSnapshots()` and resolves the card's titles
  against.
- `feed-view.tsx` now passes it: `snapshot={openPost ? snapshots.get(openPost.id) : undefined}`.
- The board render now resolves the fetched batch before using it:
  `buildTierRows(fullTitles ? resolveSnapshotTitles(snapshot, fullTitles) : titles)`.
  `undefined` (a post published before snapshots existed) keeps its documented meaning —
  show the live board whole — so nothing changes for those posts.

## How this was verified

**Unit — `__tests__/post-dialog-full-board-snapshot.test.tsx`, 2 new tests, with a negative
control:**

- Mocks `getAuthorTitles` to return a mixed two-item board (one anime, one game) — standing in
  for "the author's whole live board," exactly what production returned regardless of which
  post was open. Renders `PostDialog` with `titles`/`snapshot` scoped to the anime item only
  (what `feed-view.tsx` would actually pass for an anime-only post). Asserts the resolved board
  shows only the anime title once the async fetch lands, never the game.
- A second test confirms the documented pre-snapshot fallback still works: with `snapshot`
  omitted, both items show, matching `resolveSnapshotTitles`'s existing contract.
- **Negative control**: reverted `post-dialog.tsx` locally and reran — the first test failed
  exactly as expected, the game leaking into the board (`AssertionError: expected <span>Game Y
  to be null`) — confirming the test catches the real bug, not a vacuous pass.

**Live reproduction, before and after the fix, against real production data:**

The in-app browser pane couldn't load `tierlistonline.com` directly this session (every JS/CSS
chunk failed with `net::ERR_BLOCKED_BY_CLIENT`, a known unreliability of this pane) — the
initial diagnosis used direct Supabase REST queries instead (above). For the fix itself, ran
`npm run dev` locally against the real production Supabase project (`.env.local` points at it)
and opened `/feed` in the browser pane from there — same real data, working browser this time.
Before the fix, this reproduced the exact reported numbers. After: opening "Best Anime 2026"
now reads **"16 titles across 6 tiers,"** matching the snapshot exactly — screenshot taken but
not saved to a file (the browser tool returns the image inline; no file-saving hook was
available to route it into `.ai/reports/shots/`).

**Full suite:**

- `npm run lint` — clean (1 pre-existing unrelated warning)
- `npm run typecheck` — clean
- `npm test` — 940/940 passing, including the 2 new tests
- `npx playwright test` — 13/13 passing (no dialog markup changed, existing specs unaffected)
- `npm run build` — clean
