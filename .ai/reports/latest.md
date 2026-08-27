# Activation funnel analytics

No screenshots this round — no UI changed, only event tracking. `.ai/reports/shots/`
cleared of the previous round's images per the convention.

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
the real production bundle (`next build && next start`), not `next dev`:

- Added `NEXT_PUBLIC_POSTHOG_KEY`/`HOST` (a stub host) to the e2e build, since with no
  key at all `PostHogProvider` skips `posthog.init` entirely and there would be
  nothing running to test.
- Confirmed PostHog's own SDK genuinely initialises in the compiled bundle — real
  network requests to the configured host (`/flags`, `config.js`), not merely present
  in a jsdom-mocked unit test.
- Confirmed the magic-link form still works end to end (reaches "Link sent") once
  PostHogProvider has mounted — a broken mount would have broken the page.
- 11/11 browser tests pass, including under full parallel load (re-run twice to
  confirm, after one flaky run traced to CPU contention across ten concurrent browser
  contexts rather than a real bug — fixed by widening two assertions' timeouts rather
  than papering over it with a retry).

**Where the verification stops, honestly:** `window.posthog` never exists in this
app — the integration imports `posthog-js` as an ES module rather than the HTML
snippet, so nothing external can hook `.capture()` directly (documented in
`.ai/ARCHITECTURE.md`). What's proven instead is the full call chain up to that
point — component click → `trackEvent` → every registered provider → the PostHog
provider's `client.capture(...)` call (that last hop covered by the pre-existing
`posthog-provider.test.ts`) — plus, in a real browser, that the SDK the provider
calls into is genuinely alive. Whether `posthog-js` then successfully batches and
transmits that capture call to PostHog's actual servers is the SDK's own internals,
not this project's code, and was not chased further — a real event landing in the
PostHog dashboard the first time this ships is the natural remaining confirmation,
not something a sandboxed test can honestly claim to have watched happen.

## PR and CI

*(placeholder — updated once the PR exists and its checks have run)*

## How to see the funnel in PostHog

PostHog dashboard → Product analytics → Funnels → new funnel with steps
`signup_started` → `signup_completed` → `first_title_ranked` → `first_post_published`
→ `post_downloaded` **or** `post_shared_link` (the last two as an "either" step, not
a single next step — they are alternative signs of finishing the loop, not sequential).
