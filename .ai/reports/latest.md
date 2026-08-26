# Freeze regular tier-list posts, add a Download menu, and a Custom feed tab

## PR and CI

**PR #45 — https://github.com/Rad1xx-io/cinetier/pull/45**

| check | status |
| --- | --- |
| `Typecheck, lint and test` | success (22:46:54 → 22:47:57) |
| `Browser test` | success (22:46:54 → 22:48:09) |

`state: open`, `merged: false`, `mergeable_state: clean`, base `main`, 3 commits, 24 files changed, +1079/−118.

One CI run this time took roughly 9 minutes to start — GitHub's own Actions queue, not this branch or its workflow config (`.github/workflows/ci.yml` diffs empty against `origin/main`). Confirmed by watching the run actually start and finish, not assumed from an idle wait.

## What changed

### 1 · A post used to keep rewriting itself

A post carried no ranking data of its own — it was rendered by re-reading the author's live `ranked_titles` every time. Re-tier a title, un-rank it, and every post ever made about that board quietly changed with it.

Migration `014_ranked_title_publications.sql` mirrors 013's `custom_list_publications` for this kind of post: freezes which title sat in which tier, in what order, at the moment Publish was pressed — **not** the titles themselves. No name, no poster, no release date: those are catalogue facts, resolved live from `ranked_titles` at render time, the same way a custom board's pictures are. A title the author has since un-ranked is simply not found and drops out — a gap, not an error.

`ranked_titles` already gates a stranger's read on the author's own `is_public` flag (migration 004), so "take a whole board down" already had a lever — nothing new was added for it.

- `publishPost` now freezes the board actually on screen (like `publishCustomBoard` does), not a fresh database read. A failed snapshot insert withdraws the post rather than leaving one with nothing behind it.
- No UPDATE policy, self-checked exactly as 013 is.
- `getAuthorTitles` gained `.order("id", { ascending: true })` ahead of its 40-per-author cap — requested mid-review, after the plan was approved, because an undetermined cap meant "missing from this batch" could be pure chance rather than the author's own action, and a snapshot now reads that absence as "taken down."
- Posts published before this migration have no row here and keep rendering live until deleted and republished. **Confirmed on production: 2 such posts** (movie, game category) — untouched by this migration, as agreed.

### 2 · Downloading a post

The same `OverflowMenu` from #41/#42, in the post dialog: **Download** next to **Delete post**, offered to any viewer. Reuses `renderBoardPng`/`downloadPng` unchanged — the ref points at whichever board is already rendered (resolved snapshot for a regular post, published board for a custom one), so there was no format to adapt.

Added the watermark `TierBoard` and `CustomPostBoard` were missing relative to every other export in the app, gated to the dialog's `full` variant so the feed-card thumbnail is untouched.

### 3 · A Custom tab in the feed

One entry in `CATEGORY_TABS`. A showcase, not a moderation boundary — reporting a custom photo is still a manual `console.error` today, unchanged by this.

### Found along the way: the test harness had gone stale

`supabase/testing/run.sh` only ever applied migration `012` and only ever ran `10_rls_checks.sql`. `013` and its own `11_publication_checks.sql` (from #33) were never wired in — 013's self-check requires `009` first and would have failed the moment this script was actually run end to end. Fixed: `run.sh` now applies `009/012/013/014` and runs every numbered check file present. `ranked_titles` itself lives in `supabase/schema.sql`, outside the numbered migrations, so `00_platform.sql` gained a stand-in for it, including the 004 `is_public` read policy 014 leans on.

## Verified

- **911 unit tests** (17 new), lint, typecheck and build clean.
- **10 browser tests, all pre-existing and untouched** — confirms the post-dialog reshuffle (Delete post moving behind the menu) broke nothing already covered.
- Every new unit test has a **negative control**: `resolveSnapshotTitles`'s merge/gap logic, `getAuthorTitles`'s ordering, the publish rollback, the Custom tab, and the watermark reveal each demonstrably fail when the behaviour they check is removed.
- **RLS harness re-run clean end to end**, including `--negative` mode. `12_ranked_title_publication_checks.sql` (new, 7 checks) passed against a real PostgreSQL 16; the no-UPDATE check was separately confirmed to *fail* when that policy is temporarily reopened in the same session.
- `.ai/DECISIONS.md` and `.ai/ARCHITECTURE.md` updated with the snapshot design and the `ranked_titles`-lives-outside-migrations gotcha, so the next session does not rediscover either by hand.

## Screenshots

`.ai/reports/shots/`:
- `post-dialog-download-menu.png` — the post dialog's overflow menu open, showing **Download** alongside **Delete post**.
- `feed-tabs-with-custom.png` — the feed's category tabs with **Custom** added, selected.

Captured with Playwright against a temporary route (deleted before this was committed), the same approach used for #41/#42's toolbar screenshots — the in-app browser pane does not composite frames reliably enough to screenshot from directly.

## Not verified live

Publishing itself needs a signed-in session, which cannot be exercised here — the RLS harness proves the database side end to end (all 7 new checks, plus the existing 13 re-verified in the same run), but nobody has clicked Publish on a real account since this shipped.
