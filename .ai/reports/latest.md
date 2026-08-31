# Security remediation pass 1 — TLO-06, 02, 01, 04, 07

No screenshots this round: nothing user-visible changed. `.ai/reports/shots/`
cleared per the convention. Header behaviour is verified with `curl` against the
production build instead, which is the honest instrument for it.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## Two migrations must be run by hand before this deploys

`016_image_path_privileges.sql` and `017_rate_limits.sql`, in that order, in the
Supabase SQL Editor. Both are idempotent and both self-check at the end.

Ordering note for 016: it revokes the privilege that the old `clearTierRowImage`
used. Run the migration **first**, then deploy. Between the two, "remove this
tier's picture" is the one button that stops working; it fails quietly and
nothing else is affected. Deploying first instead would break the same button
for the same length of time, because the RPC would not exist yet.

## TLO-01 — image_path is no longer a user-writable column

The audit's highest-priority finding. The RLS policies check who owns the row
and never which column is being written, and no column-level grant existed, so
an authenticated user could write a path they had seen into a row on their own
public board and have the storage policy serve it back — defeating
`content_moderation`, `hidden_at` and `is_public` at once.

Fixed with option A from the audit, column-level privilege separation, not a
trigger. A trigger would have to distinguish "called from inside `attach_upload`"
from a direct UPDATE, which means a session flag, which is itself the next
bypass. A column grant has no such seam and PostgREST cannot argue with it.

`INSERT` had to be closed too: `Owners write their own custom tiers` is a
`FOR ALL` policy, so revoking UPDATE alone would have left the same attack
available by inserting a new tier row carrying the path.

The one legitimate direct write became `clear_tier_row_image`, deliberately the
narrowest RPC that does the job: it has no path parameter, so the only value it
can write is NULL.

The storage SELECT policy was **not** touched, as the brief required. It did not
need to be: after 016 a path can only enter the database through the grant flow,
which is what "a user can only reference a path that was legitimately attached"
actually means.

Cross-list integrity in `attach_upload` fixed in the same function: both
`p_row_id` and `p_tier_row_id` are now checked against the grant's list before
the grant is spent. The wider TLO-03 remediation (a composite foreign key) is
**not** in this pass.

## TLO-02 — auth callback open redirect

The old sanitizer checked the raw string and then handed it to `new URL()`,
which strips ASCII tab/LF/CR *before* parsing — so `%09` arrived from
`searchParams` decoded, passed every check, and became `//evil.com` inside the
parser. Rewritten so the parser is the authority: parse against the origin from
`SITE_URL`, compare `parsed.origin`, return only `pathname + search + hash`.

The trap worth recording: **comparing origins is not sufficient on its own.**
`/..//evil.com` parses to *our* origin while its pathname is `//evil.com`, which
leaves the origin again when the caller re-resolves it. There is a second guard
for exactly that, and three test cases pinning it.

## TLO-06 — Next.js 16.3.3, and the optimizer surface closed

Upgraded from 16.3.0 (exact pins kept, matching how `react` is pinned here).
`npm audit` clean. This is the patch for GHSA-2xp9-vwfh-vxw4.

`remotePatterns` then emptied, which is the surface rather than the patch.
Verified host by host that every entry was already in `DIRECT_HOSTS`, that every
`<Image>` passes `unoptimized={isUnoptimizedSource(src)}`, that custom uploads
are plain `<img>`, and — in the Next 16.3.3 source — that `generateImgAttrs`
returns on `unoptimized` before the loader that validates the list. So nothing
rendered changes, and `/_next/image` now answers 400 for a remote host instead
of fetching and decoding it.

## TLO-04 — rate limiting on the catalogue routes

No new SaaS dependency: the stack already has Postgres and has no Redis. The
counter is a table plus one atomic upsert in `consume_rate_limit` (017), with
RLS on and no policies, reachable only through the RPC.

Budgets are priced by what a request costs **upstream**, not by page
popularity — `youtube-search` is the strictest at 10/min anonymous, because
`search.list` is 100 units of a 10,000-unit day and `discoverChannels` spends
more than one call per visit.

Two passes, cheapest first: count by address against the anonymous budget, and
only look up a session when that budget is already exceeded — which is both the
fast path for ordinary traffic and the exact moment the distinction matters. The
session is read with `getUser()`, never from the cookie, because being
recognised *raises* the ceiling.

Fail-open when the limiter cannot be reached, logged at error level. Deliberate:
guest-only mode configures no Supabase at all, and one dependency being down
must not become the whole site being down. It does mean the limit is not a
defence against someone who can take the database down.

Request bounds added alongside: page numbers clamped (`?page=999999999` was
forwarded verbatim to IGDB), `query` on the games route put through the shared
sanitizer, and YouTube's `pageToken`/`regionCode` validated for shape.

## TLO-07 — security headers

`frame-ancestors 'none'` plus `X-Frame-Options: DENY` everywhere **except**
`/widgets/**`, via a negative-lookahead source. Verified with curl: present on
`/`, `/settings`, `/profile`, `/feed`, `/auth/*`; absent on
`/widgets/tier-list/*`, so embedding still works.

The full CSP ships **Report-Only**. Enforcing it today would be a guess: the App
Router injects inline bootstrap scripts with no nonce plumbed through this app,
so a correct enforced `script-src` is either `'unsafe-inline'` (which buys
little) or a nonce pipeline touching every route. No `'unsafe-eval'` anywhere.
The Supabase and PostHog origins are read from the same env the clients read, so
a preview deployment gets a policy that matches it.

HSTS at one year, without `includeSubDomains` and without `preload` — subdomains
are not enumerated anywhere in this repository, so committing them to HTTPS-only
is not a promise this file can make, and preload is effectively irreversible.

## Verified

- `npm ci` — clean install from the lockfile
- `npm audit` — 0 vulnerabilities
- `npm run lint` — clean (1 pre-existing unrelated warning)
- `npm run typecheck` — clean
- `npm test` — 1055/1055 across 83 files
- `npx playwright test` — 15/15
- `npm run build` — clean
- `supabase/testing/run.sh` — every existing check plus 10 new ones
- `supabase/testing/run.sh --negative` — both check files abort on their own
  exploit, so neither is passing vacuously
- `curl` against the production build for every header assertion above
