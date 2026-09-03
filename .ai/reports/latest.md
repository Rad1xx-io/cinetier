# Change password, for an already signed-in user

This is a **new feature on top of the already-merged PR #64** (the
resolve-identifier PII fix), not a revisit of it. Following
[[feedback_tierlistonline_security_first]]'s standing process for this
repo, this report uses its required structure and evidence vocabulary
throughout: **VERIFIED** (tested/directly probed) · **CODE VERIFIED**
(confirmed by reading code, no runtime instrument) · **INFERRED** (indirect
signal) · **UNKNOWN** (not enough evidence).

## Changed

- **Added** `app/api/account/request-password-change/route.ts` —
  authenticated-only (`getSupabaseServerClient()` + `auth.getUser()`, 401
  without a session). Sends a confirmation link to the account's *own*
  email, read from the session (`user.email`) — never from a request
  field. Reuses `resetPasswordForEmail`, the same mechanism
  `/api/auth/forgot-password` already uses, with `redirectTo` pointed at
  `/auth/callback?redirect_to=/auth/change-password` instead of
  `/auth/reset-password`.
- **Added** `app/auth/change-password/page.tsx` +
  `components/auth/change-password-panel.tsx` — the form the emailed link
  lands on. Deliberately a separate component from `ResetPasswordPanel`,
  not a shared/parameterized one: "reset" (no current password available)
  and "change" (current password required and re-verified) are different
  flows that happen to share the same recovery-session mechanism.
- **Added** `app/api/account/change-password/route.ts` — the core route.
  `{currentPassword?, newPassword}`. Looks up whether the account has a
  password at all via a new RPC (`account_has_password()`, see Database
  below); if it does, re-verifies `currentPassword` via an isolated,
  session-less Supabase client before calling `updateUser`; if it
  doesn't, treats this as "set your first password" and skips the check
  entirely. On success, calls `signOut({ scope: "others" })`.
- **Added** `supabase/migrations/026_account_has_password.sql` — a new,
  no-argument, `auth.uid()`-scoped `SECURITY DEFINER` function.
- **Updated** `components/auth/account-panel.tsx` — the signed-in branch
  gets a "Change password" button (POSTs to `request-password-change`)
  and a "check your email" confirmation state, matching
  `ForgotPasswordForm`'s existing shape.
- **Unchanged, deliberately**: `/api/auth/forgot-password`,
  `/api/auth/sign-in`, `/auth/reset-password`, `resolve_username_email`
  (migration 025) — all correct and unrelated to this feature. Magic link
  and Google sign-in, byte-for-byte the same.

## Security impact

**Two independent checks, because they defend against two different
threats, not for redundancy's sake.** A hijacked or shared-device session
with no access to the account's email should not be enough, on its own,
to change the password. A leaked password with no session and no email
access should not be enough either. So: (1) the request step proves
access to the account's email — a link is sent to `user.email`, sourced
from the session, never from an input field, so there is no identifier
for a caller to submit and nothing for the server to resolve on anyone's
behalf. This is a structural difference from PR #63's original design,
not just a fixed version of it: the entire problem class PR #64 fixed
(an endpoint that turns a caller-supplied identifier into someone else's
email) cannot recur here because there is no caller-supplied identifier
anywhere in this flow. (2) the change step proves knowledge of the
current password, for accounts that have one, re-verified server-side
right before the update takes effect.

**Current-password verification runs on an isolated, cookie-less Supabase
client, never on the client holding the active recovery session.**
`signInWithPassword` is itself a sign-in action; calling it on the same
client that `getUser`/`updateUser`/`signOut` use for this route's active
recovery session risks disturbing that session's cookies as a side effect
of what should be a read-only check. `app/api/account/change-password/route.ts`
instead constructs a second client directly via `createClient` from
`@supabase/supabase-js` (`persistSession: false`, `autoRefreshToken:
false`, no cookie adapter passed to it at all — the same pattern already
used by `limiterClient()` in `lib/rate-limit/limiter.ts`). Because this
client is handed no cookie store to write to in the first place, it
cannot touch the recovery session's cookies **by construction** — this is
CODE VERIFIED by reading how it's built, not merely hoped.

To make sure this design is actually enforced by the test suite and not
just true today, three negative controls were run for real (edited,
re-run, observed failing, reverted, re-run, observed passing again):

1. **Disabled the current-password check entirely** (skipped straight to
   `updateUser`) — 5 tests failed as expected.
2. **Leaked `currentPassword`/`newPassword` into the response body** — 4
   tests failed as expected.
3. **Replaced the isolated verifier client with the session client**
   (the exact regression this design is meant to prevent) — 9 tests
   failed, several with `TypeError: supabase.auth.signInWithPassword is
   not a function`, because the session-client mock deliberately has no
   such method. That a regression to the risky design fails this loudly,
   not just semantically, is itself part of what makes the test suite a
   reliable guard here.

All three controls were reverted; the file was confirmed back to its
exact correct state and the full suite green again after each one.

**Whether an account has a password is answered by a new database fact,
not by `app_metadata`.** PR #63's own report already established that
Supabase reports `provider: "email"` identically for magic-link accounts
and password accounts — an unreliable signal for this exact question,
and explicitly not reused here. `account_has_password()` (migration 026)
answers it directly from `auth.users.encrypted_password is not null`.

**Fails closed if the RPC itself errors.** If `account_has_password()`
returns an error, the route answers a generic 500 rather than guessing
either direction — guessing "no password" could skip a check a real
password-holding account needs; guessing "has a password" could
permanently block the legitimate first-password-setting flow if the RPC
itself is what's broken.

**The current-password error message is deliberately specific, not
generic.** `/api/auth/sign-in`'s enumeration-safety discipline (always a
generic failure) does not apply here: the caller has already proven
ownership of the account by holding the emailed link, so "Your current
password is incorrect" reveals nothing they don't already have a right to
know. The response body still never carries either password, on any
branch — that part of the discipline is unconditional and is the thing
the negative controls above check directly.

## Database

**New migration**: `supabase/migrations/026_account_has_password.sql`.

```sql
-- TierListOnline: tell whether the signed-in account has a password at all.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Why not user.app_metadata / identities / provider: PR #63's own report
-- already found Supabase reports magic-link and password accounts under
-- an identical provider: "email" — that signal cannot distinguish them,
-- and this function exists precisely because that question needs a real
-- answer for /api/account/change-password to decide whether to require
-- (and verify) a current password.
--
-- Why this is safe as an `authenticated`-only SECURITY DEFINER function
-- when resolve_username_email (025) needed much more caution: this
-- function takes NO argument at all — it reads auth.uid() internally and
-- can only ever answer for the caller's own account. There is no
-- parameter to substitute another user's id into, so it is structurally
-- incapable of being used to probe any other account, unlike
-- resolve_username_email, which is deliberately anon-callable and keyed
-- entirely by its input argument.

do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'TierListOnline: auth.users is missing — this should not be possible on a real Supabase project.';
  end if;
end $$;

create or replace function public.account_has_password()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to check your account.' using errcode = '42501';
  end if;

  return exists (
    select 1 from auth.users u
    where u.id = v_user and u.encrypted_password is not null
  );
end;
$$;

revoke all on function public.account_has_password() from public;
grant execute on function public.account_has_password() to authenticated;
revoke execute on function public.account_has_password() from anon;

-- Self-check: confirms the grant table matches intent immediately after
-- migration, the same defensive pattern migrations 017/018/025 already use.
do $$
begin
  if has_function_privilege('anon', 'public.account_has_password()', 'execute') then
    raise exception 'TierListOnline: anon must NOT be able to execute account_has_password().';
  end if;
  if not has_function_privilege('authenticated', 'public.account_has_password()', 'execute') then
    raise exception 'TierListOnline: authenticated must be able to execute account_has_password().';
  end if;
end $$;
```

**Grant, VERIFIED two independent ways:**

1. The migration's own self-check block above (runs as part of applying
   the migration itself — fails the migration outright if the grants are
   wrong).
2. The local Postgres testing harness
   (`supabase/testing/23_account_has_password_checks.sql`), extended with
   an `encrypted_password` column on the `auth.users` stand-in
   (`supabase/testing/00_platform.sql`) for this task. 5 checks, all
   passing: a password-holding fixture account answers `true`; a
   passwordless fixture account answers `false`; switching `auth.uid()`
   between the two fixtures switches the answer correctly (confirms the
   function is actually scoped by caller, not by table order or a stale
   plan); `anon` is refused outright (`permission denied for function`);
   and a direct `has_function_privilege` query confirms `authenticated`
   is granted and `anon` is not, independent of the self-check's own
   assertion of the same fact.

`resolve_username_email` (025) is completely untouched — no grant change,
no logic change.

## Abuse cases checked

| Case | Result |
|---|---|
| Call `request-password-change` unauthenticated | VERIFIED — `curl` against a real production build returns 401, `{"error":"Sign in to change your password."}` |
| Call `change-password` unauthenticated | VERIFIED — same, 401, same message, and no Supabase call is reached (test-asserted: `rpc` never called) |
| Submit a new password under 8 characters | VERIFIED — `curl` returns 400 before any Supabase call, both against the live build and via test assertion that `getUser` is never called on this path |
| Submit malformed JSON | VERIFIED — `curl` returns 400, `{"error":"Malformed request."}` |
| An account with a password, wrong current password | VERIFIED (test) — 401, "Your current password is incorrect.", `updateUser` and `signOut` never called |
| Missing `currentPassword` entirely, for an account that has one | VERIFIED (test) — 400, "Enter your current password.", verifier never called |
| An account with no password, `currentPassword` omitted | VERIFIED (test) — succeeds, verifier never constructed at all (`createClient` not called) |
| An account with no password, a `currentPassword` sent anyway | VERIFIED (test) — ignored entirely, verifier still never called |
| `account_has_password()` itself errors | VERIFIED (test) — fails closed, 500, neither the verifier nor `updateUser` is reached |
| Response body leaking either password, on success / wrong-current-password / `updateUser` failure | VERIFIED (test, 3 sub-cases) — raw response text checked, not parsed JSON, for both password strings on all three paths |
| Verifying against the recovery-session client instead of an isolated one (the regression this design exists to prevent) | VERIFIED via negative control #3 above — 9 tests catch it |
| Mismatched new/confirm password on the client | VERIFIED (test) — submit is blocked, `fetch` never called |
| Expired/already-used confirmation link | CODE VERIFIED — handled entirely by the existing, unmodified `/auth/auth-code-error` path before `ChangePasswordPanel` ever mounts; the panel's own "no session" branch (VERIFIED by test) covers the case where a session genuinely never existed on this render |
| `request-password-change`'s own send failing | VERIFIED (test) — a real, specific error is surfaced (500, generic message), **not masked** the way `forgot-password` masks it — correct here because the caller is already authenticated and has proven identity via session, so there is no enumeration risk being protected against by staying silent |

## Tests

All commands run from a clean working tree state; results below are from
the final run after all work in this task.

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning in `__tests__/post-delete.test.tsx`) |
| `npm run typecheck` | clean |
| `npm test` | **1419 passed**, 113 files |
| `npm run build` | clean — `/api/account/request-password-change` and `/api/account/change-password` are `ƒ` (dynamic, correct); `/auth/change-password` is `○` (static, correct — matches `/auth/reset-password`'s own shape, since the client-side branch on session state is what actually varies, not the server-rendered shell) |
| `npx playwright test` | 15 passed, unchanged, including the untouched magic-link and #64 regression coverage |

**New test files:**

- **`change-password-route.test.ts`** (18 tests) — the core coverage:
  correct-password success with call ordering (verify before update),
  wrong password, missing current password, no-existing-password path
  (with and without an extraneous field), RPC failure (fails closed),
  `signOut` failure (still reports overall success), response-body
  leak checks (3 sub-cases), input validation, rate limiting, auth
  gating.
- **`request-password-change-route.test.ts`** (8 tests) — correct
  `redirectTo` construction, no-body-required, unmasked failure
  surfacing (the explicit divergence from `forgot-password`), auth
  gating, rate limiting.
- **`change-password-panel.test.tsx`** (9 tests) — invalid/no session,
  not-configured, has-password form (shows current-password field,
  submits correctly, surfaces a wrong-password error), no-password form
  (omits the field, different button label, submits correctly),
  client-side mismatch blocking submit, `account_has_password` RPC
  failure showing a distinct error state instead of guessing which form
  to render.
- **`account-panel-change-password.test.tsx`** (4 tests) — request POST
  with no body, confirmation state replacing the button, request failure
  surfaced without losing the button, guest view never showing the
  button at all.
- **`23_account_has_password_checks.sql`** (5 checks, local Postgres
  harness) — see Database above.

**Negative controls — actually run, not only written:**

- Disabled the current-password check in
  `app/api/account/change-password/route.ts` (short-circuited straight
  to `updateUser`) — 5 tests failed exactly as expected. Reverted;
  confirmed the file matched its correct state and the suite passed
  again.
- Added `currentPassword`/`newPassword` to the success response body —
  4 tests failed exactly as expected. Reverted; confirmed clean again.
- Replaced the isolated verifier client with
  `getSupabaseServerClient()`'s own session client for the
  `signInWithPassword` call — 9 tests failed, several via a thrown
  `TypeError` from the mock rather than a soft assertion failure,
  because the session-client mock has no `signInWithPassword` method at
  all by design. Reverted; confirmed clean again.

**Manually verified against a real production build (`npx next start
-p 3100`), `curl`, no mocks, no real Supabase account created or
modified:**

- `request-password-change` unauthenticated → 401, generic message.
- `change-password` unauthenticated → 401, same message.
- `change-password` with a new password under 8 characters → 400,
  before any Supabase call.
- `change-password` with malformed JSON body → 400.

Server stopped after verification; no other endpoints exercised, no
credentials or session cookies used anywhere in this pass.

## Security regression — existing controls re-checked

- **Rate limiting**: both new routes gated by `rateLimitOrNull(request,
  "auth")`, test-asserted to run before any Supabase call on both
  routes, reusing the existing `"auth"` tier unchanged from #63.
- **`/api/auth/forgot-password`, `/api/auth/sign-in`,
  `resolve_username_email` (025)**: not modified in this task; the full
  existing regression suites for both (from #63/#64) still pass
  unchanged as part of the 1419-test run above.
- **`refreshSessionFromCookies()` (#64)**: not needed for this feature —
  see Remaining risks below for why, and note this is a reasoned
  conclusion, not an oversight.
- **Existing magic-link/Google e2e coverage**: re-run in full (15/15),
  confirming zero regression on the untouched flows.

## Remaining risks

- **(a) `signOut({ scope: "others" })` — VERIFIED available, and used.**
  Checked against the actually-installed version, not the `package.json`
  semver range: `node -e` against
  `node_modules/@supabase/supabase-js/package.json` confirms
  `2.112.3` is what's actually installed. Read
  `node_modules/@supabase/auth-js/dist/main/GoTrueClient.d.ts` and
  `lib/types.d.ts` directly (CODE VERIFIED) — `signOut({scope:
  "others"})` is present and typed in this exact installed version, and
  its own documentation states explicitly that no `SIGNED_OUT` event
  fires for the current session under that scope. The route calls it
  unconditionally after a successful `updateUser`, treating its own
  failure as non-fatal (logged, not surfaced) since the password change
  itself has already succeeded by that point.

- **(b) The `signInWithPassword`-then-`updateUser` sequencing — tested
  via negative control, not against a live Supabase backend.** This was
  explicitly checked empirically rather than assumed from SDK types, per
  the task's own instruction, but "empirically" here means: three real
  negative controls (above) confirm the test suite would catch both (i)
  a regression back to verifying on the same client that holds the
  recovery session, and (ii) either password leaking into a response —
  which is the mechanism by which "disturbing the recovery session"
  would actually manifest as an observable bug. What was **not** done,
  consistent with this session's established policy of never creating or
  mutating a real Supabase account (the same boundary respected in PR
  #64's own report), is running the actual sequence against a live
  Supabase project with a real recovery session and a real second
  client, and confirming the `updateUser` call still succeeds afterward.
  That specific claim is **CODE VERIFIED, not VERIFIED**: the isolated
  client is built with no cookie store at all
  (`persistSession: false`, no adapter), which by construction gives it
  nothing to write that could collide with the session client's own
  cookie jar — but this reasons from the client's construction, not from
  observing both calls actually execute back-to-back against Supabase's
  real servers. If Denis wants this closed to VERIFIED, the one way to
  do it is to actually walk the flow by hand once against a real
  (disposable) test account.

- **(c) `account_has_password()` grant — VERIFIED `authenticated` only,
  not `anon`.** Confirmed twice, independently: the migration's own
  self-check block (fails the migration if either grant is wrong) and
  the local Postgres harness's 5 behavioral checks, including a direct
  `has_function_privilege('anon', …)` query returning false and an
  actual `anon`-role call returning `permission denied for function`
  rather than a boolean. Both were run in this pass, not carried over
  from an earlier task.

- **UNKNOWN**: real end-to-end behavior against the live, configured
  Supabase project — this environment's outbound network path to it is
  restricted for real auth calls (the same `TypeError: fetch failed`
  signature already documented in #64's own report for the rate
  limiter), so nothing in this task exercised `signInWithPassword`,
  `updateUser`, or `resetPasswordForEmail` against the real backend. All
  Supabase-facing behavior above is either CODE VERIFIED by reading the
  installed SDK, or VERIFIED against mocked routes/RPCs plus the local
  Postgres harness for the database layer specifically.
