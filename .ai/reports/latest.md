# Extend content reporting to feed posts and comments

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## What changed

### 1 · The report route now accepts posts and comments

`SUBJECT_TYPES` in `app/api/custom-reports/route.ts` gained `"post"` and `"post_comment"`
alongside the existing `"custom_item"`/`"custom_list"`. Same route, same table
(`content_reports`), same auth-required / fail-quiet-but-log-loudly behaviour as before — a
report is only ever logged at `console.error` and forwarded to `CONTENT_REPORT_WEBHOOK_URL`
if one is configured, and a failed insert is the one thing that still returns an error to the
caller.

`ReportSubjectType` in `lib/types/custom-list.ts` widened to match.

### 2 · Migration 015 — widen the database check

`content_reports.subject_type` had a `CHECK (subject_type in ('custom_item', 'custom_list'))`
constraint from migration 012. `015_report_feed_content.sql` drops and re-adds it with `post`
and `post_comment` added — the route would otherwise 500 on every feed report the moment it
tried to insert. No new table: a report is one idea regardless of what it points at.

```sql
-- TierListOnline: let a report point at a feed post or a comment on one, not
-- only a custom board's own content. Run once in the Supabase SQL Editor.
-- Safe to re-run.
--
-- content_reports (012) started as the one signal for something nothing here
-- inspects automatically: a picture somebody should not have uploaded. The
-- community feed (009) has the same gap — a post's title and description, or
-- a comment on it, is read by whoever wrote it and whoever's looking, and
-- there was no way to flag either one. This widens the same table's
-- subject_type check rather than adding a second reports table: a report is
-- one idea regardless of what it points at, and the API route already reads
-- subject_type generically.

do $$
begin
  if to_regclass('public.content_reports') is null then
    raise exception 'TierListOnline: run migration 012 first — public.content_reports is missing.';
  end if;
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing.';
  end if;
end $$;

alter table public.content_reports drop constraint if exists content_reports_subject_type_check;
alter table public.content_reports add constraint content_reports_subject_type_check
  check (subject_type in ('custom_item', 'custom_list', 'post', 'post_comment'));
```

**Run this migration in the Supabase SQL Editor before merging** — the route will 500 on
every feed report until it has.

### 3 · `ReportButton`/`ReportDialog` moved to `components/ui/`

They were `components/custom-list/report-button.tsx`, a self-contained trigger + dialog. Now
split in two, both in `components/ui/` since the feed uses them too:

- `ReportDialog` — the form itself (reason textarea, send, "Reported" state), now controlled
  (`open`/`onClose`) so a caller that already has its own trigger (an overflow menu item) can
  drive it without owning a second copy of the dialog.
- `ReportButton` — the small flag-icon trigger + its own open state, wrapping `ReportDialog`,
  unchanged in behaviour for its existing callers (`custom-card.tsx`, `custom-board.tsx`, both
  just import from the new path). Gained an optional `className` to override its trigger's
  background treatment — the default (`bg-background/80 backdrop-blur`) suits a control
  floating over a picture; a comment in a plain list needed a lighter one instead.

### 4 · The feed UI

- **A post**: "Report" added to the post dialog's existing `OverflowMenu` ("More post
  actions"), next to Download and Delete post — not a new icon in the like/comment row. Not
  offered to the post's own author. Not added to the feed-card grid, matching the existing
  precedent that Download/Delete post are dialog-only too.
- **A comment**: each comment row in the post dialog gets its own `ReportButton` (comments
  had no per-item actions of any kind before this). Not offered on your own comment.

Neither surface gates on being signed in — the same convention `ReportButton` already had for
custom items and boards. A signed-out visitor sees Report same as anyone; the route's existing
401 surfaces inline in the dialog if they actually try to send one.

## Verified

- `npm run lint` — clean (1 pre-existing unrelated warning)
- `npm run typecheck` — clean
- `npm test` — 917/917 passing, including 6 new unit tests in
  `__tests__/post-report.test.tsx` (post-level: offered/not-offered by author, sends the right
  subject+reason, rejects a too-short reason; comment-level: offered only on somebody else's
  comment, reports the specific comment's id)
- `npx playwright test` — 12/12 passing, including 2 new specs in `e2e/feed-report.spec.ts`
  against the real built page (network stubbed, `/api/custom-reports` intercepted rather than
  exercised for real)
- `npm run build` — clean
- Playwright screenshots against the production build (`.ai/reports/shots/`):
  `post-actions-menu-with-report.png` (Report next to Download in the overflow menu, the flag
  icon visible on somebody else's comment), `post-dialog-with-comment-report.png`,
  `report-dialog.png` (the dialog open on a post, mid-draft)
