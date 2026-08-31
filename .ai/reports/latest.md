# Security remediation pass 3 — TLO-10, 11, 12, 13, 14, 16, 17 + CSP

No screenshots: the only visible change is a report button on a tier row, which
follows the existing card pattern exactly. Header behaviour is verified with
`curl` against production builds, which is the honest instrument for it.

## PR and CI

_Filled in after the PR is opened and CI is confirmed — see chat for the final status table._

## Stacked

Branches from `security-remediation-pass-2`, which is PR #53 and not merged.
PR #52 (Pass 1) **is** merged and live.

Two new migrations, **021 and 022**, on top of the five already pending.

## TLO-10 — profile enumeration

`using (true)` did the job it was written for — resolving `/u/<username>` with
no session — and also answered the same query without a username, returning
every account including those with `is_public = false`.

The trap that makes the obvious fix wrong: `post_feed` joins profiles with
`security_invoker`, so a profile the reader cannot see is a post that silently
vanishes from the feed — and a private account is allowed to post (`post_feed`
selects `is_public` precisely so the card can decide whether to offer Fork).
So the rule is `is_public OR own OR has posted`. What stops being readable is a
private account that has never published anything, which nothing ever read.

004 was narrowed to `is_public or auth.uid() = id` as well, so re-running it
cannot restore `using (true)`. The posts clause cannot go there — `public.posts`
does not exist until 009 — so a re-run of 004 *narrows* rather than widens.
That direction of failure was chosen deliberately.

## TLO-11 — tier-row moderation

One subject type added to the existing system. The storage policy was **not**
touched: it resolves a tier picture by asking whether the tier row is visible,
and visibility is decided by the policy that now consults `is_blocked`.

**A gap my own test found rather than review:** `Owners write their own custom
tiers` was `for all`, and `for all` includes SELECT. Policies are OR'd, so the
owner read their own tier rows through the ownership rule, around the moderation
check — a blocked tier stayed visible to its owner, and storage served them the
picture. Split into INSERT/UPDATE/DELETE; SELECT now only through the
moderation-aware rule. Owners lose nothing, since that rule already grants them
their own rows.

## TLO-12 — auth error disclosure

Production was returning a `Location` header containing Supabase's explanation
of PKCE verifier storage, complete with advice about which library to use
server-side — a description of the deployment's internals, to anyone who can
make the exchange fail, which is anyone.

The wire now carries one of three fixed codes; the real message goes to the log.
The error page was the other half: `REASONS[raw] ?? raw` printed an unrecognised
value verbatim, so anyone could put a sentence of their choosing on a page of
this site by linking to it.

## TLO-13 — e2e fixture

Gated at module scope, not per request: `notFound()` on a prerendered page
removes the route from the bundle, which is stronger than answering 404.
Production sets neither variable → 404. `playwright.config.ts` sets
`E2E_FIXTURES=true` for the single build the suite shares. Verified both ways by
hand.

## CSP — partially enforced

Three directives moved from report-only to **enforced**, each checked against
the source rather than assumed: `object-src 'none'` (no `<object>`/`<embed>`
anywhere), `base-uri 'self'` (no `<base>`), `form-action 'self'` (every form is
an `onSubmit` handler with no `action`). Plus `frame-ancestors`, already
enforced.

`script-src`, `style-src`, `img-src`, `connect-src` and `default-src` remain
Report-Only. Next injects inline hydration scripts with no nonce, so an honest
enforced `script-src` is either `'unsafe-inline'` — which buys little — or a
nonce pipeline that would make every static page dynamic. That decision needs
real violation reports, which I do not have.

**A Next behaviour worth recording:** two `headers()` rules setting the same key
do not combine — the later rule *replaces* the earlier. Splitting
`frame-ancestors` and the other three across the two rules produced a `/` that
carried only `frame-ancestors` and had silently lost the rest. Caught by curl,
fixed by joining them into one value per rule.

## Verified

- `npm ci` — clean install
- `npm audit` — 0 vulnerabilities
- `npm run lint` — clean (1 pre-existing unrelated warning)
- `npm run typecheck` — clean
- `npm test` — 1168/1168 across 86 files
- `npx playwright test` — 15/15
- `npm run build` — clean
- `supabase/testing/run.sh` — 87 checks across 10 files, 0 errors
- `supabase/testing/run.sh --negative` — both original files still abort on
  their own exploit
- `curl` against production builds: enforced CSP correct on `/`, `/settings`,
  `/profile`; widget still framable; e2e fixture 404 in a production build and
  present in the Playwright build

## Production is still behind

Pass 1 code is live with **no migrations applied**. `clear_tier_row_image` is
absent, so "remove this tier's picture" is broken in production right now, and
TLO-01/04/05 are inert there. Nothing in this pass changes that; the deployment
order is in the chat report.
