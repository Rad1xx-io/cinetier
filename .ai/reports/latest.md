# Critical fix: PII leak in PR #63's `/api/auth/resolve-identifier`

This is a **new PR on top of the already-merged PR #63** (email+password
sign-in), not an amendment to it — the vulnerability was found by an
independent review after #63 landed on `main`. Following
[[feedback_tierlistonline_security_first]]'s standing process for this
repo, this report uses its required structure and evidence vocabulary
throughout: **VERIFIED** (tested/directly probed) · **CODE VERIFIED**
(confirmed by reading code, no runtime instrument) · **INFERRED** (indirect
signal) · **UNKNOWN** (not enough evidence).

## Changed

- **Deleted** `app/api/auth/resolve-identifier/route.ts` — the vulnerable
  route.
- **Added** `app/api/auth/sign-in/route.ts` — resolves the identifier and
  calls `signInWithPassword` in one server-side request; writes the
  session directly to cookies via `getSupabaseServerClient()`.
- **Added** `app/api/auth/forgot-password/route.ts` — resolves and calls
  `resetPasswordForEmail` server-side; always answers `{ ok: true }`.
- **Added** `lib/supabase/resolve-identifier.ts` — the shared
  `resolveIdentifierEmail` helper both new routes call; the resolution
  logic itself is unchanged from the old route, only where it runs and
  what leaves the request changed.
- **Added** `refreshSessionFromCookies()` to `lib/supabase/session-store.ts`
  — the incidental gap this fix's own architecture opened (see below),
  found and closed in the same pass rather than left for later, per the
  standing process's stopping rule.
- **Updated** `components/auth/auth-form.tsx` — `SignInForm` and
  `ForgotPasswordForm` now POST to the two new routes and never call
  `signInWithPassword`/`resetPasswordForEmail` client-side at all.
  `RegisterForm` is untouched — it never went through the vulnerable
  route.
- **Unchanged, deliberately**: `resolve_username_email` (migration 025)
  itself — its grants, its own internal rate limiting, and the decision to
  let it resolve private profiles too. That trade-off was already reasoned
  through in migration 025's own comments and PR #63's report; this fix is
  about not re-exposing what the function returns, not about revisiting
  the function's own design.
- **Unchanged, deliberately**: magic link (`signInWithOtp`) and Google
  (`signInWithOAuth`) — byte-for-byte the same as before #63.

## Security impact

**The vulnerability, confirmed by reading the deleted code:**
`resolve-identifier`'s route resolved a username through
`resolve_username_email` and returned the email directly:
`return NextResponse.json({ email })`. Since that RPC deliberately resolves
private profiles too (a documented, load-bearing requirement of PR #63 —
a private profile's owner has to be able to sign in by their own handle),
this route re-exposed exactly the fact the RPC's own design accepted as a
narrow, unavoidable cost: whether a given username maps to an account.
What it should never have re-exposed was the **email itself** — a real PII
value, reachable by any unauthenticated caller, for any username,
regardless of profile privacy. Usernames are effectively public (`/u/<username>`,
every post byline, every shared link), so this was a practical harvesting
vector: known or guessed usernames → real email addresses, bypassing the
privacy `is_public` is supposed to provide. The route's own 5/min-per-IP
rate limit throttled one address but did nothing against distributed
harvesting across many usernames from many addresses — the only cross-IP
bound was `resolve_username_email`'s own 30-per-5-minutes-**per-username**
ceiling, which bounds repetition against one handle, not breadth across
many.

**The fix moves the entire action server-side, not only the resolution
step.** `/api/auth/sign-in` and `/api/auth/forgot-password` each resolve
the identifier internally (via `resolveIdentifierEmail`, unchanged logic,
new location) and immediately use the result against Supabase's own
`signInWithPassword`/`resetPasswordForEmail`, in the same request, using
`getSupabaseServerClient()` — the same cookie-writing client
`/auth/callback` already uses. The resolved email exists only inside the
server's own request handling; it is never assigned to a response body
variable, on any branch, on either route (CODE VERIFIED — read both route
files end to end; the identifier local variable is the only thing that
ever reaches a response, and it's the raw user input, not the resolved
result).

**Who can call what, unchanged from #63:** both routes remain
unauthenticated by necessity (a sign-in attempt has no session yet). What
changed is what a caller can *learn* from calling them: previously,
`resolve-identifier` was an oracle that turned a username into an email;
now, `/api/auth/sign-in` is exactly what it already needed to be — a
password check that returns generic success/failure, and
`/api/auth/forgot-password` is exactly what its UI already promised — a
send that never confirms or denies account existence.

## Database

No migration in this fix. `resolve_username_email` (migration 025) is
completely unmodified — same grants (`anon`, `authenticated`), same
internal `consume_rate_limit` ceiling, same behavior for a private
profile. The vulnerability was never in the database layer; it was in what
the application layer did with a value that layer correctly returned only
to the server that asked for it.

## Abuse cases checked

| Case | Result |
|---|---|
| POST a username to the old route, read back the email | **Route no longer exists** — VERIFIED via `curl` against a production build: `POST /api/auth/resolve-identifier` returns `404` |
| POST a username to `/api/auth/sign-in`, inspect the response for the resolved email | VERIFIED — `sign-in-route.test.ts`'s "the email never appears in ANY response body" suite reads raw response *text* (not parsed JSON) on three separate paths: successful sign-in, wrong password, unresolved username. All three assert the resolved email string is absent. Also VERIFIED against a real deployed build with a real, known public username (`owner`) and a deliberately wrong password — raw response inspected via `curl`, no email present |
| Same, for `/api/auth/forgot-password` | VERIFIED — `forgot-password-route.test.ts`'s equivalent suite, plus a case for when `resetPasswordForEmail` itself errors (the error message is logged server-side, never forwarded, and still no email in the body) |
| Distinguishing "wrong password" from "unresolved identifier" via the sign-in response | VERIFIED — a dedicated test drives both scenarios through the real route and asserts identical response shape and status; both terminate in Supabase's own generic "Invalid login credentials" message, which the route passes through unchanged |
| Distinguishing "account exists" from "account doesn't exist" via the forgot-password response | VERIFIED — a dedicated test confirms a resolved and an unresolved identifier produce byte-identical JSON responses, and a separate test confirms a failed *send* (Supabase error) also produces the identical response — three different underlying outcomes, one observable response shape |
| A caller skipping both new routes and calling `resolve_username_email` directly via `POST /rest/v1/rpc/...` | Unchanged from #63 — still bounded by the RPC's own internal 30-per-5-minutes-per-username ceiling. Not this fix's concern (see Changed: the RPC itself is untouched) |
| The incidental gap this fix's server-side move opened: does the signed-in UI actually appear? | VERIFIED, not assumed — see Tests below. This was flagged explicitly as a risk in the task and treated with the seriousness that implies, not left as an unverified side effect of "the code compiles" |

## Tests

All commands run from a clean state; results below are from the final run
after every fix in this task.

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | **1380 passed**, 109 files (was 1361/106 before this fix) |
| `npm run build` | clean — `/api/auth/sign-in` and `/api/auth/forgot-password` are `ƒ` (dynamic, correct); the old route is gone from the route table entirely |
| `npx playwright test` | 15 passed, unchanged, including the magic-link e2e spec — confirming zero regression on the untouched flows |

**New/rewritten test files:**

- **`sign-in-route.test.ts`** (12 tests) — the regression suite for this
  exact vulnerability class, plus enumeration-safety, rate limiting, input
  validation, and the not-configured case.
- **`forgot-password-route.test.ts`** (11 tests) — same shape, plus the
  "identical response regardless of outcome" property this route adds on
  top.
- **`session-store-refresh.test.ts`** (4 tests, new) — pins
  `refreshSessionFromCookies`'s actual behavior in isolation: updates every
  subscriber, handles "no session found", handles "not configured".
- **`sign-in-session-transition.test.tsx`** (2 tests, new) — the test that
  proves the incidental session-sync gap is actually closed: renders the
  real `AuthArea` and the real `session-store.ts` (neither mocked), drives
  a full password sign-in through the mocked `/api/auth/sign-in` fetch, and
  asserts the header visibly swaps from "Sign in" to the account menu —
  and, separately, that a refused sign-in does *not* transition. This is
  the test a passing typecheck alone would never catch.
- **`auth-form-password.test.tsx`** (14 tests, rewritten) — updated for the
  new request/response contract; registration tests are unchanged since
  `RegisterForm` was never affected.
- **`analytics-signup.test.ts`, `rate-limiter.test.ts`** — untouched
  logic, only a stale comment referencing the deleted route's path was
  corrected in the latter.
- **Removed**: `resolve-identifier-route.test.ts` (tested the now-deleted
  route; superseded by the two files above).

**Negative controls — actually run, not only written, per the task's own
explicit ask:**

- `app/api/auth/sign-in/route.ts`: temporarily changed the final response
  to `NextResponse.json({ ok: true, email })`, re-ran
  `sign-in-route.test.ts` — 2 tests failed exactly as expected (`expected
  { ok: true, …(1) } to deeply equal { ok: true }` and the raw-text
  `not.toContain` assertion), confirming the test suite would have caught
  the original vulnerability. Reverted; confirmed the file was back to its
  correct state and the suite passed again (12/12).
- `app/api/auth/forgot-password/route.ts`: same technique — 4 tests failed
  (including the "identical response" enumeration-safety test, a useful
  bonus catch), reverted, confirmed 11/11 passing again.
- `lib/analytics/signup.ts`: removed the marker's
  `sessionStorage.removeItem` (its consume-once behavior) — the
  "consumes the marker" test failed exactly as expected, reverted.
- `components/auth/auth-form.tsx`: passed the raw identifier instead of
  the resolved email into `signInWithPassword` — the "resolves the
  identifier" test failed as expected, reverted.
- The app-level rate-limit gate itself (`if (limited) return limited;` in
  either route) was **not** live-mutated for a negative control this
  session — the session's own safety tooling declined to run further
  commands while that specific check was disabled in source on an earlier,
  unrelated task in this same session, and this report treats that as the
  correct outcome to respect rather than something to route around.
  Confidence in that specific line rests instead on: the route tests'
  explicit assertion that a mocked `rateLimitOrNull` refusal short-circuits
  before the RPC or the Supabase auth call is ever reached, and the
  pre-existing, extensive `rate-limiter.test.ts` suite (unmodified by this
  fix, still 100% passing) that already exercises `rateLimitOrNull`'s own
  refusal/pass-through machinery generically.

**Manually verified against a real production build, `curl`, no
mocks, no real Supabase account created or modified:**

- Old route: confirmed `404`.
- Both new routes: confirmed `400` for missing/malformed input, entirely
  before any Supabase call.
- Real known username (`owner`, from PR #61's own verification), wrong
  password, against `/api/auth/sign-in`: raw response inspected — no
  email present. This environment's outbound network path to the real
  configured Supabase project is itself restricted (`TypeError: fetch
  failed`, the identical signature already visible throughout this
  session's e2e runs for the pre-existing, unrelated rate limiter) — so
  the actual credential check could not be observed succeeding, but this
  incidentally proved something else useful: server logs showed
  `TierListOnline: username resolution failed — TypeError: fetch failed`
  (logged, not forwarded) followed by the generic auth error reaching the
  client, and separately, `/api/auth/forgot-password` against the same
  username under the same network condition still answered `{ ok: true }`
  — confirming the response-masking logic holds even when the underlying
  call fails outright, not only when it cleanly finds nothing.
- Opened the password sign-in / register / forgot-password sections in a
  real browser against the production build and read the console
  throughout (no submission of real credentials) — zero React/hydration
  warnings, consistent with PR #63's own equivalent check.

## Security regression — existing controls re-checked

- **Rate limiting on both routes**: re-verified via test that
  `rateLimitOrNull(request, "auth")` is still called first, before any
  other work, on both routes (CODE VERIFIED + test-asserted).
- **`resolve_username_email`'s own grants and internal ceiling**:
  unmodified; not re-run against the local Postgres harness this session
  since nothing in this fix touches the migration, and re-running it would
  have only re-confirmed what PR #63's report already VERIFIED with no
  code change in between.
- **`profiles` RLS**: unmodified, not touched by this fix at any layer.
- **Existing magic-link/Google e2e coverage**: re-run in full (15/15
  passing), confirming the untouched flows still work exactly as before.

## Remaining risks

- **UNKNOWN**: whether the leaked emails were actually harvested before
  this fix landed. This app has no access log retention this session
  could inspect; if Denis has Vercel/Supabase request logs covering the
  window PR #63 was live on `main`, checking `/api/auth/resolve-identifier`
  hit volume and source diversity would be the way to find out. Not
  attempted here — outside this session's access.
- **INFERRED, not directly probed**: Supabase's own platform-level
  behavior was not independently re-verified in this pass beyond what
  PR #63 already covered — this fix changes *where* Supabase is called
  from, not *how*, so that surface is unchanged.
- **CODE VERIFIED, not independently re-derived**: the claim that
  `getSession()` reads storage fresh on every call but does not itself
  notify `onAuthStateChange` for an already-valid session — read directly
  from `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js`'s
  `__loadSession()` in this environment's installed version, not from
  Supabase's own documentation (no network access to fetch it). A future
  `@supabase/auth-js` upgrade could in principle change this internal
  behavior; `refreshSessionFromCookies` explicitly writes the session
  itself rather than relying on the SDK to notify, which is what makes it
  robust to that possibility regardless.
