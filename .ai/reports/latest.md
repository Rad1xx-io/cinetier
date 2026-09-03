# Email+password sign-in — a third door, plus sign-in by username

Following [[feedback_tierlistonline_security_first]]'s standing process for
this repo, this report uses its required structure and evidence vocabulary
throughout: **VERIFIED** (tested/directly probed) · **CODE VERIFIED**
(confirmed by reading code, no runtime instrument) · **INFERRED** (indirect
signal) · **UNKNOWN** (not enough evidence).

## Changed

Google and magic-link sign-in are untouched — `signInWithOAuth`/
`signInWithOtp` and every line around them are byte-for-byte the same as
before this task, just living in a renamed file. Added:

- **Password sign-in and registration**, accepting either an existing email
  or an existing **username** in the identifier field.
- **Forgot-password**, end to end: request a reset link, click it, set a new
  password.
- A new SECURITY DEFINER function, `resolve_username_email` (migration 025),
  the only way to turn a username into an email before there is a session.
- A new API route, `/api/auth/resolve-identifier`, which is where password
  sign-in's rate limiting actually lives.
- A new `"auth"` rate-limit tier in the existing `lib/rate-limit/limiter.ts`.
- `MagicLinkForm` → `AuthForm` (renamed, not rewritten): the same one
  component used in the header popover and in Settings, now with a
  collapsed-by-default third section for the password door.
- `/auth/reset-password`, a new page reached only through the existing
  `/auth/callback` (unmodified) after `resetPasswordForEmail`'s link.
- `SignupMethod` gained a `"password"` value, and `lib/analytics/signup.ts`
  gained a session-scoped marker to attribute it correctly (Supabase reports
  both magic-link and password accounts under the identical
  `provider: "email"` — CODE VERIFIED against this repo's own pre-existing
  test, which pinned `provider: "email"` → `"magic_link"` before this task).

## Security impact

**Who can call what, and what it reveals — worked out before writing code:**

- `resolve_username_email(p_username)` — callable by `anon` and
  `authenticated` (has to be, since it exists specifically for the
  before-session case). Reads exactly one column across two tables
  (`profiles.username` → `auth.users.email`) and returns a single `text`
  value, never a row, never an error that could be told apart from "not
  found" (CODE VERIFIED: the self-check in migration 025 asserts the return
  type is plain `text`, and the function's own `exception`-free structure
  means every non-match path — bad input, no such username, rate-limited —
  returns the same `null`). Deliberately resolves a **private** profile's
  username too, which `/u/<username>` itself refuses to confirm exists (see
  this repo's own 2026-09-02 SSR decision) — this is the one place in the
  app that reveals more about a private handle than the public page does,
  and it is unavoidable: the alternative is a private account's owner unable
  to sign in by their own username. Bounded by two independent rate-limit
  layers (below), and by the fact that claiming a username already reveals
  whether it is taken, via the pre-existing `saveProfile` uniqueness check —
  so "does this username exist" was not a new question this migration
  introduced, only "resolve it to an email" is new, and that never happens
  without the caller already knowing the exact username.
- `/api/auth/resolve-identifier` — no auth required (same reason). Reads the
  request body, no cookies, no session lookup unless the rate limiter's fast
  path needs one (existing `decide()` logic in `limiter.ts`, unmodified).
  Writes nothing except the rate-limit counters both layers touch.
- Nothing new writes to `profiles` except through the pre-existing
  `saveProfile`, called with the same `auth.uid() = id`-gated insert policy
  that already governs every other caller of it (migration 004, unmodified).
- Nothing new reads `auth.users` except through the one narrow function
  above — no other code in this change set touches that schema.

**Replayability / automation:** `resolve_username_email` and
`/api/auth/resolve-identifier` are both idempotent reads with no side effect
beyond the rate-limit counters, so "replay" here means "probe faster",
exactly what both limiter layers exist to bound (see Database, below).
`signUp`/`signInWithPassword`/`resetPasswordForEmail`/`updateUser` are all
called directly against Supabase's own client SDK, which already carries
its own account-level protections this app does not reimplement (INFERRED —
Supabase Auth is known to rate-limit its own token/signup endpoints
platform-side; not independently probed in this task).

## Database

**New migration: `supabase/migrations/025_password_auth.sql`.**

- Dependency-guarded (`raise exception` unless 004 and 017 have already
  run), idempotent (`create or replace function`), self-checking (asserts
  the exact grant state: `anon` and `authenticated` both have EXECUTE, and
  fails loudly if either is missing).
- `revoke all … from public` followed by an *explicit* `grant execute … to
  anon, authenticated` — not left implicit. Migration 023 already documented
  in this repo that `revoke all … from public` does **not** touch Supabase's
  default per-role grant, so the explicit grant here is what actually states
  the intent, matching the pattern `consume_rate_limit`/
  `increment_post_views` already use for the same reason.
- Internal rate limiting reuses `consume_rate_limit` (migration 017)
  directly — no second limiter implementation, keyed by
  `'username-resolve:' || lower(username)`, 30 requests / 300 seconds.

**No RLS policy changed.** `profiles`' SELECT policy is exactly what it was
after migration 021; `resolve_username_email` does not read through it at
all (SECURITY DEFINER bypasses RLS by design, which is the entire reason
this had to be a function rather than a client query).

**`lib/rate-limit/limiter.ts`:** one new entry in the existing `BUDGETS`
table (`auth: { anonymous: 5, authenticated: 10, windowSeconds: 60 }`), no
change to `checkRateLimit`/`rateLimitOrNull`/`catalogueGate` themselves.

## Abuse cases checked

| Case | Result |
|---|---|
| Anonymous read of a private profile via `resolve_username_email` | Resolves to the email anyway — **intended**, see Security impact. Confirmed the `profiles` row itself is still unreadable by anon in the same test run (VERIFIED, `22_username_resolution_checks.sql` check 2) |
| Direct `POST /rest/v1/rpc/resolve_username_email`, bypassing `/api/auth/resolve-identifier` entirely | Bounded by the function's own internal `consume_rate_limit` call — VERIFIED: 35 rapid calls against one username in the local harness, ~28 allowed (fewer than the configured 30, because earlier checks in the same test file already spent part of that bucket — the shared counter behaving exactly as designed, not a bug) then refused |
| Enumerating which usernames exist, by trying to sign in | `/api/auth/resolve-identifier` returns the raw identifier unchanged when nothing resolves — `signInWithPassword` then fails the identical generic way it would for a wrong password. VERIFIED at the route level (`resolve-identifier-route.test.ts`) and at the form level (`auth-form-password.test.tsx`, asserts no "no such user"-shaped text ever renders) |
| Enumerating which emails have accounts, via forgot-password | `resetPasswordForEmail` is asked regardless of whether resolution found anything, and the UI shows the identical "if an account exists…" copy either way — VERIFIED in `auth-form-password.test.tsx` |
| Brute-forcing a known account's password | `/api/auth/resolve-identifier` gates every password-sign-in attempt (not just ones that needed username resolution — CODE VERIFIED: the route is called unconditionally before `signInWithPassword`, and a dedicated test pins that an already-email-shaped identifier still counts against the limiter) at 5/min anonymous. The actual password check itself (`signInWithPassword`) is Supabase's own endpoint, outside this app's rate limiter — INFERRED to carry Supabase's own platform-level protection, not independently verified |
| Registering an account and writing to `profiles` without a session | Structurally impossible: `saveProfile` is only ever called after `signUp` returns a session (CODE VERIFIED, the `if (data.session)` branch), and `profiles`' insert policy independently requires `auth.uid() = id` regardless (migration 004, unmodified) |
| A taken username at registration silently overwriting or exposing another account | `saveProfile` is the same uniqueness-checked function `UsernameDialog` already uses; a collision fails cleanly and the new account still exists, unclaimed — no other account is touched (CODE VERIFIED, no change to `saveProfile` itself) |
| Client-side password floor weaker than the server's | `minLength={8}` set on every password input regardless of Supabase's own dashboard minimum, which defaults lower — the client is never laxer than the server, only possibly stricter (see the dashboard reminder below) |

## Tests

All commands run from a fully clean state; results below are from the final
run after every fix in this task.

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | **1361 passed**, 106 files (was 1328/103 before this task) |
| `npm run build` | clean — `/api/auth/resolve-identifier` is `ƒ` (dynamic, correct for an API route); `/auth/reset-password` is `○` (static, correct — it reads its own session client-side, same as every other guest-safe page) |
| `npx playwright test` | 15 passed, unchanged |
| `supabase/testing/run.sh` (local Postgres, migrations 004→025 applied) | **VERIFIED** — every pre-existing check plus all 6 new ones in `22_username_resolution_checks.sql` (public resolves, private resolves, nonexistent → null, case-insensitive, return type is plain text, per-username ceiling engages) |

**New test files:** `resolve-identifier-route.test.ts` (10), `auth-form-password.test.tsx`
(14), `reset-password-panel.test.tsx` (5), `22_username_resolution_checks.sql`
(6 behavioral SQL checks), plus extensions to `analytics-signup.test.ts` (+4)
and `rate-limiter.test.ts` (+1). `auth-form-signup-started.test.tsx` (renamed
from `magic-link-signup-started.test.tsx`) confirms the magic-link path is
byte-identical in behavior after the rename.

**Negative controls run and reverted, all caught the intended failure:**

- SQL: none needed — the local harness already runs a `--negative` mode
  covering unrelated migrations; this migration's own 6 checks were written
  and verified directly against the real function, VERIFIED end to end
  including the rate-limit ceiling actually engaging (not just asserted as
  configured).
- `lib/analytics/signup.ts`: removed the marker's `sessionStorage.removeItem`
  → the "consumes the marker" test failed as expected (`expected 'password'
  to be 'magic_link'`) → reverted.
- `components/auth/auth-form.tsx`: passed the raw identifier instead of the
  resolved email into `signInWithPassword` → the "resolves the identifier"
  test failed as expected → reverted.
- The rate-limit gate itself in `/api/auth/resolve-identifier` was **not**
  live-mutated for a negative control — the session's own safety tooling
  declined to run tests while that specific check was disabled in source,
  which this report treats as the correct outcome rather than something to
  route around. Its correctness rests instead on: the route test's explicit
  assertion that `rateLimitOrNull`'s refusal short-circuits before the RPC
  is ever called (VERIFIED via a mocked refusal), and the pre-existing,
  extensive `rate-limiter.test.ts` suite that already exercises
  `rateLimitOrNull`'s own refusal/pass-through machinery generically
  (unmodified by this task, still 100% passing).

**Manually verified in a real browser, production build, no live Supabase
writes:** opened the header popover and the Settings panel, expanded the
password section, switched through sign-in → register → forgot-password →
back to sign-in, typed into every field (including a live username →
`/u/<handle>` hint check), and read the console throughout — **VERIFIED**,
zero React/hydration warnings at any point. Did **not** click through an
actual `signUp`/`signInWithPassword`/`resetPasswordForEmail` submission
against the real configured Supabase project — that would create a real,
throwaway account in the same project this app's other e2e specs
deliberately avoid touching (the existing magic-link e2e spec stops at
"Link sent" for the same reason). Functional correctness of those calls is
covered instead by the mocked component/route tests above, which is judged
sufficient for logic whose only remaining risk is "did I call the SDK
method with the right arguments" — already pinned by those tests.

Hydration-mismatch risk was also reasoned through structurally, not only
observed: `AuthForm`'s initial render is pure `useState` literals with no
external data source, so server and first-client-render are identical by
construction; `ResetPasswordPanel` uses the existing `useSupabaseSession`
hook exactly as `AuthArea`/`AccountPanel` already do, whose
`getServerSessionSnapshot()` already returns the same `loading` state the
client's own first render starts from (CODE VERIFIED, unmodified from
before this task) — no new divergence was introduced.

## Security regression — existing controls re-checked

- **`profiles` SELECT policy** (migration 004/021): re-verified anonymous
  read of a private profile still fails, in the same test run that verifies
  the new function's private-profile behavior (VERIFIED, check 2 of
  `22_username_resolution_checks.sql`).
- **`profiles` INSERT policy** (`auth.uid() = id`): unmodified; the
  registration path is structurally incapable of reaching it without a
  session (see Abuse cases checked).
- **`consume_rate_limit`'s own self-check** (migration 017): re-ran as part
  of `run.sh` alongside every other check in this task's verification pass
  — VERIFIED still passing, unmodified.
- **Full pre-existing behavioral suite** (`10_rls_checks.sql` through
  `21_custom_board_deletion_checks.sql`): VERIFIED all still pass unchanged,
  run in the same harness invocation as the new checks.
- **`RATE_LIMIT_SECRET` degrade-safely-when-absent** behavior (limiter.ts,
  unmodified): the new `"auth"` tier goes through the exact same
  `bucketFor`/`saltFor` path as every other tier, so it inherits this
  property rather than needing its own — CODE VERIFIED, no tier-specific
  branching exists in that code path.

## Remaining risks

- **UNKNOWN**: Supabase project's actual current "Confirm email" setting.
  If it is on, one-step registration degrades to "account created, username
  claim deferred to Settings" rather than failing — reasoned through and
  tested for both branches (CODE VERIFIED + `auth-form-password.test.tsx`),
  but which branch real users actually hit in production is unverified from
  this environment.
- **UNKNOWN**: Supabase project's actual current password minimum length
  (dashboard default is commonly 6). **Action for Denis, outside code, per
  the task's own explicit ask**: Supabase → Authentication → Policies (or
  Password settings, depending on dashboard version) — raise the minimum to
  at least 8 to match what this app's own forms already enforce
  client-side.
- **INFERRED, not directly probed**: Supabase Auth's own platform-level
  rate limiting on `signInWithPassword`/`signUp`/`resetPasswordForEmail`
  themselves — this app's new limiter covers the identifier-resolution step
  every attempt passes through, not the password-check call itself, which
  this app has no way to intercept without proxying the entire auth
  exchange server-side (a materially larger change this task did not scope
  in).
- **Not attempted, deliberately out of scope**: no live end-to-end password
  signup/sign-in/reset was run against the real Supabase project (see
  Tests). If Denis wants that level of confidence before shipping, it would
  need to be done manually or via a disposable test account, not by this
  session.
