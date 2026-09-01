# Production readiness — final verification & hardening, pass 4

No screenshots: nothing in this pass changes a pixel. The whole of it is three
EXECUTE grants, one rate-limit tier, a plpgsql guard and a test harness mode.

## PR and CI

PR #55 — https://github.com/Rad1xx-io/cinetier/pull/55, branched from `main`.

## Branching

PR #54 was **merged while this pass was in progress**, so the branch this work
started on stopped being the right base mid-flight. The commit was cherry-picked
onto a fresh branch off the new `main`; the resulting tree is identical. Worth
remembering as a habit rather than as an incident: check the PR state again
before pushing, not only before starting.

PR #52 (pass 1), #53 (pass 2) and #54 (passes 2+3) are all merged. One new
migration, **023**, on top of the seven already pending — the pending set is
**016–023**, and none of them are applied.

## Production is behind its own code, right now

Probed directly at the end of this pass, not inferred:

| probe | result | meaning |
|---|---|---|
| `GET /rest/v1/rate_limits` | 404 PGRST205 | 017 not applied |
| `GET /rest/v1/post_view_marks` | 404 PGRST205 | 018 not applied |
| `GET /rest/v1/profiles` | 200 | the key works — the 404s are absence, not auth |
| `GET /api/post-views` | 405 | the route exists, so pass-2 code **is** deployed |

Merging #54 deployed the code without the migrations going first. What that
breaks live: `/api/post-views` calls the two-argument `increment_post_views`
from 018, which does not exist, so view counting fails outright; the rate
limiter cannot find `consume_rate_limit` and fails open, leaving every
catalogue route unmetered; `clearTierRowImage()` cannot find its function;
reporting a tier picture hits a CHECK that does not accept `custom_tier_row`.
TLO-10, the composite FK and report dedup remain unfixed live.

This does not resolve itself and does not need a redeploy — applying
016 → 023 in order brings the schema back into agreement with what is running.

## What this pass was looking for

Everything fixable in code, repository or configuration without production
credentials. Two genuinely new findings, one pre-existing defect that had never
been caught because nothing ever built the database from scratch, and a
documentation gap. Nothing else surfaced: the fifteen phases re-walked the
findings of passes 1–3 and confirmed each fix still stands in the tree.

## Finding A — `/api/custom-uploads` was unbounded

The most expensive request the app serves: up to 2 MB read into memory, sniffed
byte by byte, then two counting queries and a write to Storage.

`issue_upload_grant` already caps a person at fifty granted uploads a day, and
that looked like the limit. It is not — it counts what *succeeds*. A request
refused earlier in the handler (wrong format, rights box unticked, oversized)
never reaches the grant and so was never counted against anything. The
expensive half of the route was therefore unbounded for anyone holding an
account, and the cheapest way to abuse it was to send requests that fail.

Fixed by adding an `upload` tier to `lib/rate-limit/limiter.ts` — 5 anonymous,
15 authenticated, per minute — and calling the limiter as the **first**
statement of the handler, before the Supabase client is even constructed. That
ordering is the point: a limiter that runs after the body is read has already
paid the cost it exists to prevent.

Fifteen a minute is far above deliberate use (a person picks files one at a
time) and far below what a script needs to be a nuisance.

## Finding B — `anon` held EXECUTE on the upload functions

Migrations 012 and 016 each end a definer function with

    revoke all on function … from public;
    grant  execute on function … to authenticated;

which reads as "authenticated only" and is not. `public` there is the PUBLIC
pseudo-role; revoking it does not touch a grant held by `anon`. Supabase ships
`alter default privileges … grant execute on functions to anon, authenticated`,
so all three functions were granted to `anon` the moment they were created, and
the later `grant … to authenticated` neither added nor removed anything for that
role. Read out of `pg_proc.proacl`, not assumed:

    attach_upload        :: postgres=X/postgres anon=X/postgres authenticated=X/postgres
    issue_upload_grant   :: postgres=X/postgres anon=X/postgres authenticated=X/postgres
    clear_tier_row_image :: postgres=X/postgres anon=X/postgres authenticated=X/postgres

**Not exploitable today**, and that was established by calling all three as
`anon` rather than by reading them:

    issue_upload_grant   -> refused: "Sign in to upload a picture."
    attach_upload        -> refused: "No upload was granted for that file."
    clear_tier_row_image -> refused: "Sign in to edit a board."

Each refuses because its own body tests `auth.uid()`. The grant was meant to be
the outer ring that makes that test the second line of defence rather than the
only one, so migration 023 restores it. The next definer function somebody
writes should not be the one that discovers the internal check was load-bearing.

Three functions are deliberately left anon-callable, and 023 asserts they stay
that way: `is_blocked` (the RLS policies of every public board call it),
`consume_rate_limit` (anonymous traffic is most of what it counts) and
`increment_post_views` (counting a signed-out visitor is the feature).
`has_upload_grant` is also left alone: the storage INSERT policy calls it as the
caller, so revoking it would turn a clean row-level-security refusal into a
permission-denied error on a function. Both refuse the write; only one of them
is a sentence anybody can act on.

012 and 016 were amended in place as well, so a fresh install never has the gap
in the first place — 023 exists for the database that already ran them.

## Finding C — a clean install was broken, and had been for a long time

Migrations 005 and 006 guarded a destructive drop with

    if to_regclass('public.criteria_scores') is not null
       and not exists (select 1 from public.criteria_scores limit 1) then

plpgsql plans an `IF` condition as a single expression, so the second half is
parsed even when the first is false. On an empty database the migration died on
a table that does not exist. 005, 006 and 007 all failed; the guard is now
nested, and every migration 002–023 applies to an empty database.

This had never been noticed because production was built incrementally and the
harness always replayed against a database that already had the tables.

## The regression check, and why it needed a second fix of its own

`supabase/testing/run.sh --fresh` builds a database from nothing — platform
primitives, `schema.sql`, then every migration in order — and exits 1 with
`--- a clean rebuild is BROKEN ---` on the first failure.

Getting it right took two corrections worth recording, both caught by running it
rather than by reading it:

1. It first selected the platform primitives out of the stub with
   `sed -n '1,95p'`. Line numbers silently became wrong the moment a table was
   added to the stub, and because the resulting psql exit code met `set -e`, the
   script aborted **with no output whatsoever** — a check that appears to pass.
   Now selected by marker, and a stub that will not apply says so and exits 1.
2. The stub carries abbreviated stand-ins for the application tables, which is
   correct in normal mode (production already has them; no migration creates
   them). In fresh mode it is exactly backwards: `create table if not exists`
   means the stub's short version wins, `profiles` loses `updated_at`, and 011
   fails on a column that exists in production. Fresh mode now drops every
   application table from the stub and lets the real owner create it — 004 for
   `profiles`, `schema.sql` for the two `ranked_*`.

Verified as a negative control, not just as a pass: reintroducing the 005 guard
defect makes it fail with `FAIL 005_criteria_scores.sql` and exit 1.

## Documentation

`NEXT_PUBLIC_ANALYTICS_ENDPOINT` is browser-visible by construction — the events
are sent from the page, so the address is inlined into the bundle. `.env.example`
now says so, and says the thing that follows from it: it must never be a url
carrying a token or a secret path. This sits next to the opposite warning
already written for `CONTENT_REPORT_WEBHOOK_URL`, which must never gain the
prefix.

## Deployment

**DEPLOYMENT BLOCKED — NO AUTHORIZED PRODUCTION MUTATION PATH.**

Unchanged from the previous pass and re-confirmed here: the project is not
linked to the Supabase CLI, and no authorized production mutation mechanism is
available in this environment. Migrations 016–023 are applied by hand in the
Supabase SQL Editor, in order, and **must precede** the deployment that depends
on them. Until they are, production runs pass-1 code with none of them:
`clearTierRowImage()` is broken live, the rate limiter fails open, and TLO-01
and TLO-05 remain reachable.

## Verification

Every command below was run in this pass.

| check | result |
|---|---|
| `npm ci` | clean |
| `npm audit` | 0 vulnerabilities |
| `npm run lint` | 0 errors (1 pre-existing warning in `__tests__/post-delete.test.tsx`) |
| `npm run typecheck` | clean |
| `npm test` | 1170 passed, 86 files |
| `npx playwright test` | 15 passed |
| `npm run build` | clean |
| `run.sh` | 0 failures |
| `run.sh --negative` | both exploits still succeed — the controls prove something |
| `run.sh --fresh` | every migration applies to an empty database |

The three new SQL assertions:

    CONFIRMED: anon cannot execute the upload flow at all
    CONFIRMED: public boards, rate limiting and view counting are still anon-callable
    CONTROL PASSED: an authenticated upload still works after the revoke

No negative control was weakened or deleted to make anything pass.
