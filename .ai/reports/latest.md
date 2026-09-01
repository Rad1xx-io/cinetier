# Security remediation pass 5 — abuse surfaces, migration coherence, remaining blockers

No screenshots: the only visible change is a "too many requests" view on three
detail pages, and it appears only when the limiter refuses.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final
status table._

## Where the repository actually is

PR #55 was merged during the previous pass, as PR #54 was during the one before
it. `main` is `4c9ec04` and contains passes 1–4 in full — verified per commit
rather than assumed, including the NUL-byte fix and migrations 016–023. Nothing
is stranded on an obsolete branch.

## One new finding: the catalogue pages were never metered

The limiter lived only in the `/api` route handlers. But `/title/[id]`,
`/anime/[id]` and `/youtube/channel/[id]` call TMDB, AniList and YouTube
themselves during their server render, with an id taken straight from the url.
Same upstream call, same quota, no counting — so asking for the page instead of
the API was a way to spend the budget for free.

The id is the cache key, so the five-minute `revalidate` does not help: distinct
ids miss the cache every time by construction. On YouTube, whose quota is the
scarce one at 10,000 units a day and one unit per `channels.list`, walking
distinct channel ids takes the catalogue off the site until the quota resets —
without touching a metered endpoint once. `/youtube/channel/[id]` does not even
validate the id, so those ids need not exist.

This is the same shape as the `/api/custom-uploads` finding from pass 4: a
control placed at the business action while the cost is incurred elsewhere.

**Fix.** `catalogueGate(tier)` in `lib/rate-limit/limiter.ts` — the same
decision the routes get, for a server component. Identity is rebuilt from
`headers()` (only the two headers that identify a caller), and the answer is a
boolean because a page cannot return 429 the way a route can; the caller renders
a "try again shortly" view instead.

Two details without which the fix would be wrong, both deliberate:

1. The gate is wrapped in React `cache()`. `generateMetadata` and the component
   load the same data, so an unmemoised gate would charge two units for one page
   view and silently halve every budget. The loaders are wrapped for the same
   reason.
2. The gate sits *after* the free id check and *before* the upstream call. A
   malformed id should cost nothing rather than a unit of somebody's budget.

**Test.** `__tests__/catalogue-page-metering.test.ts` states it as an invariant
over the tree rather than as three assertions: it finds every dynamic page that
imports a catalogue client and requires `catalogueGate` before the first
upstream call, plus `cache()` on the loader. The failure it is really written
for is a *fourth* detail page added later by someone with no reason to know any
of this. Verified as a negative control — deleting the gate from one page fails
the suite. Five behavioural tests cover the gate itself.

## A second, smaller change: a missing salt now complains

The fallback rate-limit salt is a constant in a public repository. A deployment
that never set `RATE_LIMIT_SECRET` does not merely lose anonymity — every bucket
key becomes computable, and `consume_rate_limit` is anon-callable by design
(the server calls it as `anon`), so a computed key is a way to spend another
visitor's budget for them. They still cannot raise their own.

Not made fatal: guest-only and preview deployments run happily without it, and
failing closed would turn a missing variable into an outage. Instead one loud
`console.error` in production, on first use.

**This stays unresolved in production until the operator sets the variable.** It
cannot be checked from here.

## What was examined and is not a finding

Recorded so the next pass does not re-derive it:

- **Infrastructure tables are deny-all.** `rate_limits`, `upload_grants`,
  `post_view_marks` and `content_moderation` each have RLS enabled and **zero
  policies**, so the broad table grants reach nothing; only the definer
  functions can touch them. Read out of `pg_policy`, not assumed.
- **`search_path = public` on the older definer functions is not exploitable.**
  `CREATE` on schema `public` is denied to `anon`, `authenticated` and
  `service_role`, every table reference in those functions is schema-qualified,
  and Postgres does not search `pg_temp` for functions or operators at all.
- **Grant accumulation does not defeat the daily upload cap.** The storage
  policy calls `has_upload_grant`, which requires a grant younger than ten
  minutes; and the cap of 50 a day bounds long-run storage growth regardless of
  when grants are spent.
- **All fifteen `/api` routes call the limiter as their first statement** —
  checked line by line. The three that looked otherwise had only comments
  in between.
- **The clean-install defect has no other instance.** Only 005 and 006 ever had
  the `IF cond AND SELECT FROM missing-table` shape; 021's guard is the safe
  single-condition form.
- **Client/server boundary is clean.** The only `process.env` reads in client
  components are `NEXT_PUBLIC_POSTHOG_*` and `NODE_ENV`.
- **Auth redirect and error surfaces are intact.** `next` still goes through
  `safeRedirectPath`; catalogue routes surface an upstream message only for
  their own error class at 429/503, and a fixed string otherwise.
- **Migration 023 is idempotent** — applied twice against a clean chain, self-
  check passing both times — and produces exactly the intended graph:
  `issue_upload_grant`, `attach_upload` and `clear_tier_row_image` are
  `anon=false authenticated=true`, while `is_blocked`, `consume_rate_limit`,
  `increment_post_views` and `has_upload_grant` keep their anon grant.

## Production

**DEPLOYMENT BLOCKED — NO AUTHORIZED PRODUCTION MUTATION PATH.** No
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` or
`VERCEL_TOKEN`; neither CLI installed; no `config.toml`, so the project is not
linked.

Re-probed today, read-only:

| probe | result | meaning |
|---|---|---|
| `GET /rest/v1/profiles` | 200 | the anon key works |
| `GET /rest/v1/rate_limits` | 404 PGRST205 | 017 still not applied |
| `GET /rest/v1/post_view_marks` | 404 PGRST205 | 018 still not applied |
| `GET /rest/v1/upload_grants` | 200 `[]` | 012 applied; RLS returns nothing |
| `GET /api/post-views` | 405 | route exists — pass-2 code deployed |
| `GET /e2e/custom-board` | 404 | TLO-13 holding: the fixture is not in the bundle |

Merging #55 put pass-4 code live at 12:04 UTC today. **The upload rate limiter
shipped in that pass is therefore inert right now**: it calls
`consume_rate_limit`, which does not exist, so it logs an error and fails open.
The same will be true of `catalogueGate` the moment this pass is merged. That is
the migration-first invariant restating itself — shipping a limiter before its
table is shipping nothing.

## Verification

| check | result |
|---|---|
| `npm audit` | 0 vulnerabilities |
| `npm run lint` | 0 errors (1 pre-existing warning) |
| `npm run typecheck` | clean |
| `npm test` | **1182 passed, 87 files** (was 1170 / 86) |
| `npx playwright test` | 15 passed |
| `npm run build` | clean; the three pages stay dynamic |
| `run.sh` | 72 checks, 0 failures |
| `run.sh --negative` | exploits still demonstrated |
| `run.sh --fresh` | every migration 002–023 applies to an empty database |

`npm ci` was run earlier in the session and no dependency changed since.

No negative control was weakened or deleted.
