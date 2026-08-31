# Security remediation pass 2 — TLO-05, 03, 08, 09, 15

No screenshots: nothing user-visible changed. `.ai/reports/shots/` is empty and
stays empty. Header behaviour is re-verified with `curl` against the production
build, which is the honest instrument for it.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## Stacked on pass 1

PR #52 is not merged yet, so this branches from `security-remediation-pass-1`
rather than `main`. Four new migrations, and they must run **after** 016 and 017:
**018 → 019 → 020**, in the Supabase SQL Editor, before this deploys. All three
self-check at the end and abort with a sentence rather than a constraint error
if anything did not take.

018 depends on 017 (it calls `consume_rate_limit`), and refuses to run without it.

## TLO-05 — post views

The function was security definer, granted to `anon`, and had no memory. The
only guard was a React ref, which is not a guard.

The design constraint that decided the shape: **the database cannot tell one
anonymous visitor from another.** PostgREST is the client as far as Postgres is
concerned, so `inet_client_addr()` is the API server, not the reader. A
DB-only de-duplication would therefore have had exactly one anonymous bucket,
counting one view per post per window for the entire internet.

So three layers, and the middle one is the one that matters against a direct
caller:

1. **Per-viewer dedup** — `auth.uid()` for a session (which no argument can
   override), an opaque key from the app otherwise.
2. **Per-post ceiling** — 300/hour whatever key arrives. This is what bounds an
   attacker who sends a fresh key every call, which is what defeating layer 1
   looks like.
3. **Per-address limit** on the new `/api/post-views`, reusing 017.

The new route exists only because of layer 1 — the address is visible there and
nowhere else. No raw address reaches the database: the app HMACs it, then the
function `sha256`s that again.

**The one-argument overload is dropped, not left beside the new one.** Leaving
it would have left the unthrottled function callable under a signature
PostgREST resolves happily. The migration's self-check fails unless exactly one
overload exists.

`grant execute … to anon` is **kept**. Counting views for signed-out readers is
the feature, not an oversight.

## TLO-03 — cross-list integrity

016 already validated both parameters before spending the grant, so this pass
added the structural half: a composite FK `(list_id, row_id) → (list_id, id)`.

Both are needed, and the reason is specific: `attach_upload` covers card
**creation**. `custom_items.row_id` is an ordinary column with an ordinary
UPDATE grant — it is what `moveItem()` writes on every drag — and the RLS policy
there checks the row's `list_id` and nothing about the tier it is moving to. The
old single-column FK was satisfied by any tier row anywhere.

**A defect my own test caught:** a plain `on delete set null` on a composite key
nulls *every* referencing column, `list_id` included, and `list_id` is
`not null` — so deleting a tier would have aborted instead of returning its
cards to the pool, breaking behaviour 012 chose deliberately. Fixed with
`on delete set null (row_id)` (Postgres 15+), and the migration's self-check
reads `confdeltype`/`confdelsetcols` out of the catalogue rather than trusting
that the syntax did what it looks like it does.

## TLO-08 — migration 012 idempotency

012 and 013 created the same policy under the same name, and 012's version was
the vulnerable one. Re-running 012 over 013 silently restored the hole.

012 is already applied in production, so "rewrite history or forward-migrate"
was a real question. **Corrected in 012 itself**, because: the resulting
database state is unchanged (013's identical version is already there); a
forward migration would not have helped, since re-running 012 would still
restore the hole; and a file that says "safe to re-run" has to be. 013 remains
what fixes already-deployed installs.

The test does not check that the migration executes. It re-applies 012 over 013
through `\ir` and then checks the property 013 exists for. Negative control
confirmed: revert the qualification in 012 and the test fails with
`REGRESSION SUCCEEDED: re-running 012 made a hidden card visible again`.

## TLO-09 — report spam and webhook injection

Two problems, deliberately fixed differently.

**Spam** — a unique index on `(reporter_id, subject_type, subject_id)`,
plus a `report` tier on the existing limiter and a 409 on the duplicate.
The index excludes `reason` (reword it and you would mint a new report) and
excludes `status` (wait for a dismissal and re-file, and "dismissed" becomes a
state the reporter controls). Different people reporting the same thing stays
allowed — that is the signal the feature collects.

**Injection** — the only genuinely broken thing was string concatenation with
`\n` into the webhook text. **The log turned out to be safe already, and was
left alone:** `console.error` with an object runs strings through
`util.inspect`, which escapes the newline — checked empirically rather than
assumed. So only the webhook changed: structured fields, a flattened summary,
`allowed_mentions: {parse: []}` for Discord and `mrkdwn: false` for Slack as the
authoritative controls, with zero-width spaces inside `@`/`<` as the fallback
for a consumer that has neither.

`subjectId` is now validated as a uuid, which also stops a malformed value
becoming a 500.

## TLO-15 — input bounds

The real gap was `youtube/details`: `id` went to `channels.list` unvalidated,
and that endpoint takes up to fifty comma-separated ids. The route reads only
`items[0]`, so a batch bought an attacker nothing except a wider request made on
their say-so.

`Number.isFinite` in the two other details routes accepted `-1`, `1.5` and
`1e300`, each of which became an upstream request that could only fail.
Replaced with digits-only, positive, ≤ 10,000,000 — and **refusing** rather than
clamping, because an out-of-range page has a sensible substitute and an id does
not.

## TLO-04 regression check

The limiter buckets on tier and identity only, never on anything from the URL.
Pinned with four new cases: varying the query string, the page, the encoding and
the path all land in the same bucket.

Order is limit → validate → upstream. Validation runs before any external call,
so an invalid request never spends quota; keeping the limit first means a flood
of garbage still costs the sender budget rather than being free.

## Verified

- `npm ci` — clean install from the lockfile
- `npm audit` — 0 vulnerabilities
- `npm run lint` — clean (1 pre-existing unrelated warning)
- `npm run typecheck` — clean
- `npm test` — 1136/1136 across 84 files
- `npx playwright test` — 15/15
- `npm run build` — clean, `/api/post-views` present
- `supabase/testing/run.sh` — 68 checks across 8 files
- `supabase/testing/run.sh --negative` — both original check files still abort on
  their own exploit; TLO-08's control verified separately by reverting 012
- `curl` against the production build: anti-framing headers still present on `/`
  and `/settings`, still absent on `/widgets/*`; the new bounds return 400
  before any upstream call
