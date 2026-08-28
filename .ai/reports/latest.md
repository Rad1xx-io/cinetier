# Activation funnel analytics

No screenshots this round — no UI changed, only event tracking. `.ai/reports/shots/`
cleared of the previous round's images per the convention.

## PR and CI

**PR #46 — https://github.com/Rad1xx-io/cinetier/pull/46**

*(check status filled in once CI has run on the final commit)*

## What changed

PostHog was already fully wired (SDK, auto page-view, `signup_completed`) before this
task — the work was five new funnel events on top of the existing `lib/analytics/`
infrastructure, not a new integration.

| event | fires | properties |
| --- | --- | --- |
| `signup_started` | every magic-link form submit, before Supabase answers | `entry_point` |
| `first_title_ranked` | the local board's title count going from 0 to 1 | none |
| `first_post_published` | this account's `posts` row count going from 0 to 1, whichever kind publishes first | `post_type: "tier_list" \| "custom"` |
| `post_downloaded` | a successful Download from a post's overflow menu | `post_id`, `category` |
| `post_shared_link` | a custom board turning public, or a tier list's "Copy link" | `surface: "tier_list" \| "custom_board"` |

Every "first_*" event is computed from a fact read immediately before the write —
the local store's own count for `first_title_ranked`, a `select … limit 1` against
`posts` for `first_post_published` — never a remembered flag. Decision and the
reasoning (including the one accepted race, a same-instant publish from two tabs)
are in `.ai/DECISIONS.md`, dated 2026-08-27.

No PII in any payload: no email, no JWT, only public identifiers (`post_id`, which
is already a public post's own id) and neutral category/type strings. Checked as a
fact in the payload-shape test, not asserted field by field.

## What was actually verified, not just written

**Unit — 22 new tests across 5 files, every one with a negative control** (the fix
reverted, the test shown to fail against the real code, not a mock of the code under
test):

- `analytics-tracker.test.ts` — payload shape and event names for all five, plus the
  no-PII check, run against the real `trackEvent`/provider pipeline.
- `activation-funnel.test.ts` — `addTitle()`'s real first-title gating (fires once,
  not on a second title, not on a duplicate add of the same title); `isFirstPostForUser`
  against a fake `posts` table; `publishCustomBoard`'s real gating (fires once, not on
  a second board, not when the account already had a post).
- `publish-post-first-event.test.ts` — the same gating for `publishPost`, module-mocked
  the way `tier-list-actions-custom-clear.test.tsx` already does for the same reason
  (`publishPost` reaches for its Supabase client internally rather than taking one as
  a parameter).
- `post-delete.test.tsx` (extended) — `post_downloaded` fires on a successful Download
  with the right post id and category, and does not fire when rendering fails.
- `magic-link-signup-started.test.tsx` — the real `MagicLinkForm` component fires
  `signup_started` on submit, before Supabase's response, and still fires when
  Supabase goes on to refuse the address.
- `post-shared-link.test.tsx` — the real `TierListActions` "Copy link" and the real
  `CustomBoard` visibility toggle; confirmed the toggle fires only on the transition
  *to* public, not the reverse (a dedicated negative case, not just the happy path).

All 929 unit tests pass; lint, typecheck and build clean (one pre-existing,
unrelated warning in `post-delete.test.tsx`).

**Browser — one new Playwright spec, `e2e/activation-funnel.spec.ts`**, run against
the real production bundle (`next build && next start`), not `next dev`.

The first version tried to go further than this: a stub `NEXT_PUBLIC_POSTHOG_KEY`/
`HOST` in the shared build so PostHog's own SDK would genuinely `init()`, proving
real network requests left the page. Locally, with default parallelism, that flaked
once (traced to ten concurrent browser contexts under CPU load); widening two
assertions' timeouts made it pass twice more, locally. On GitHub Actions it failed
outright. The stub key is baked into **the one build every spec in the suite shares**,
so it made `PostHogProvider` attempt real network requests to an unreachable `.test`
host in the background of every other test in the directory too, not only this one —
and how fast a given environment's resolver gives up on a host that will never
resolve is not something a laptop and a GitHub-hosted runner are guaranteed to agree
on. That is a real risk to the whole suite for one test's benefit, and it is exactly
the kind of thing that is invisible on one machine and flaky on another — so it was
reverted rather than chased further. `playwright.config.ts` carries the reasoning.

What ships instead: the real click sequence — Sign in, fill the email, submit — on
the real built page, still reaches "Link sent". No key is configured, matching every
other spec here, so `PostHogProvider.start()` returns before `posthog.init` is ever
called — the same state the whole rest of the suite already runs in. 11/11 browser
tests pass, confirmed twice under full parallel load after the revert.

**Where the verification stops, honestly:** `window.posthog` never exists in this
app even when PostHog is genuinely configured — the integration imports `posthog-js`
as an ES module rather than the HTML snippet, so nothing external can hook
`.capture()` directly (documented in `.ai/ARCHITECTURE.md`), and getting a real SDK
instance running in the shared e2e build turned out to cost more than it proved. What
*is* proven, end to end, is the call chain up to the SDK's own boundary — component
click → `trackEvent` → every registered provider → the PostHog provider's
`client.capture(...)` call, that last hop covered by the pre-existing
`posthog-provider.test.ts` — plus, now, that the click sequence itself survives in
the real compiled page. Whether `posthog-js` then successfully batches and transmits
a capture call to PostHog's actual servers is the SDK's own internals, not this
project's code; a real event landing in the PostHog dashboard the first time this
ships is the natural remaining confirmation, not something a sandboxed test can
honestly claim to have watched happen.

## How to see the funnel in PostHog

PostHog dashboard → Product analytics → Funnels → new funnel with steps
`signup_started` → `signup_completed` → `first_title_ranked` → `first_post_published`
→ `post_downloaded` **or** `post_shared_link` (the last two as an "either" step, not
a single next step — they are alternative signs of finishing the loop, not sequential).

---

# Static pages: /about, /privacy, /terms

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## What changed

### 1 · Three new static pages

`app/about/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx` — each a plain
`export const metadata: Metadata` object (title, description, `alternates.canonical`,
Open Graph, Twitter card), matching the pattern already used by `app/discover/page.tsx`
for pages with no dynamic route params. `generateMetadata` was requested by name, but
that async form is reserved in this codebase for pages that need it — `app/u/[username]/page.tsx`
is the only real example, driven by the dynamic `username` param. None of the three new
pages have one, so the plain export is the actual existing convention, and using it here
is a deliberate reading of "follow the existing pattern" over the literal function name.

- **About** — short, direct paragraph in the homepage hero's voice: what the site does,
  that it's an independent solo project, not affiliated with TMDB/IGDB/YouTube.
- **Privacy** — written from the actual codebase, not boilerplate: Supabase Auth (Google
  OAuth + magic-link email, no passwords stored), local-first boards mirrored to Supabase
  once signed in, publish-time snapshotting, custom image uploads (2 MB cap, JPEG/PNG/WebP,
  server-enforced rights checkbox, manual-only report review — no automated content
  scanning), PostHog analytics (page views + product events tied to account id, never
  email; session recording with all inputs masked, including the magic-link email field;
  no ad networks, no cookie-consent banner since none exists in the app today), TMDB/IGDB/
  YouTube catalogue data with no account info sent, affiliate "where to watch" links and
  the donate button both described as outbound-only with no payment handled on-site, and
  a deletion-request contact email.
- **Terms** — short UGC acceptable-use terms: content ownership, forking etiquette, the
  right to remove content on report, no-warranty disclaimer, "terms may change" clause.

### 2 · Footer links

`app/layout.tsx`'s footer (previously just the TMDB attribution line) now has an About /
Privacy / Terms nav row above it. The `hidden ... md:block` behavior on the `<footer>`
itself is untouched — still desktop-only, same as before.

### 3 · Sitemap

All three routes added to `SITEMAP_ROUTES` in `lib/seo/site.ts` at `priority: 0.3`,
`changeFrequency: "yearly"` — informational pages, ranked below every content route.

## Contact email decision

`kseronikseu@gmail.com` is used on `/privacy` as the account/data-deletion contact,
per explicit confirmation from the user — this address appeared earlier in the session
as a third party's test account affected by an unrelated data-isolation bug, so it was
flagged and re-confirmed before use. Logged in `.ai/DECISIONS.md`; not to be re-litigated
without a new reason.

## Verified

- `npm run lint` — clean (1 pre-existing unrelated warning in `__tests__/post-delete.test.tsx`)
- `npm run typecheck` — clean
- `npm test` — 911/911 passing (75 files)
- `npm run build` — clean; `/about`, `/privacy`, `/terms` all prerender as static (`○`)
- Playwright screenshots taken against the production build (`.ai/reports/shots/`):
  `footer-with-links.png`, `about-page.png`, `privacy-page.png`, `terms-page.png`

---

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
