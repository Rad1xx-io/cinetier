# Change password: fix "change" vs "set" wording inconsistency

Small follow-up on top of the already-merged [PR #65](https://github.com/Rad1xx-io/cinetier/pull/65) (change password for signed-in users). **Copy/wording only** — no security, flow, route, or database changes. Given the size, this uses a shorter version of the standing report format rather than forcing every section from [[feedback_tierlistonline_security_first]]; evidence vocabulary (**VERIFIED** / **CODE VERIFIED** / **INFERRED** / **UNKNOWN**) is kept where it's still meaningful.

## The bug

`ChangePasswordPanel`'s submit button already read correctly — "Change password" when the account has one, "Set password" when it doesn't. But `app/auth/change-password/page.tsx` rendered a static `<h1>Change password</h1>` regardless of state, and `AccountPanel`'s Settings entry-point button always said "Change password" too. A passwordless account (arrived via Google or magic link) saw "Change password" as the page title with "Set password" as the button directly under it — two different words for the same action on the same screen.

## Changed

- **`app/auth/change-password/page.tsx`** — no longer renders its own `<h1>`; it's a server component and structurally cannot know `hasPasswordState` (client-side RPC result), which is exactly why the mismatch existed in the first place. The page wrapper now only supplies layout.
- **`components/auth/change-password-panel.tsx`** — every branch now owns its own `<h1>`: neutral "Password" for `loading`/invalid-link/error/not-configured (states where `hasPasswordState` isn't known yet), and "Change your password" / "Set a password" — driven by the same `hasPassword` boolean the button already used — in the form itself. The submit button's own passwordless label changed from "Set password" to "Set a password" to match the heading exactly, not just approximately. The `status.kind === "done"` message now reads "Password set." instead of "Password updated." for the passwordless→now-has-one case (nothing was updated; it didn't exist before). Reordered the early-return checks so `status.kind === "done"` is evaluated after `hasPasswordState` is resolved to `"known"` — needed for TypeScript to narrow `hasPasswordState.hasPassword` without a cast; behaviorally a no-op, since `done` can only occur after a submission, which can only happen after `hasPasswordState` was already known.
- **`components/auth/account-panel.tsx`** — the Settings entry-point button now calls `account_has_password()` client-side (same RPC `ChangePasswordPanel` already calls — `authenticated`-only, no argument, nothing new granted) and picks "Change password" / "Set a password" the same way. Defaults to "Change password" while the RPC is in flight (the common case, and non-critical since the server independently re-decides whether to require a current password at submit time regardless of what this button said).
- **Unchanged, deliberately**: `app/api/account/change-password/route.ts`, `app/api/account/request-password-change/route.ts`, migration 026 (`account_has_password()`), `resolve_username_email`, magic link, Google, and the confirmation email template (a Supabase dashboard asset, not app code).

## Tests

| check | result |
|---|---|
| `npm run lint` | 0 errors (1 pre-existing, unrelated warning) |
| `npm run typecheck` | clean |
| `npm test` | **1422 passed**, 113 files (was 1419 before this fix — 3 new tests) |
| `npm run build` | clean; `/auth/change-password` still `○` (static) |
| `npx playwright test` | 15 passed, unchanged |

**Test changes:**
- `__tests__/change-password-panel.test.tsx` — renamed all `"Set password"` assertions to `"Set a password"`; added a heading assertion to the existing has-password test; added a dedicated test that the passwordless heading and button read the identical string (and that neither says "Change"); added a test that a successful passwordless submission shows "Password set." and not "Password updated."
- `__tests__/account-panel-change-password.test.tsx` — added an `rpc` mock (the component now calls it); added a test that the Settings button reads "Set a password" for a passwordless account.
- `__tests__/change-password-route.test.ts`, `__tests__/request-password-change-route.test.ts` — untouched; these test the routes, which this fix doesn't touch.

## Manual check

Ran the real production build and opened both affected screens in a real browser (no negative controls needed — nothing here is security logic to break-and-revert):
- `/auth/change-password` with no session (invalid-link fallback) — VERIFIED: exactly one `<h1>` ("Password", the neutral state), correct message, no console errors beyond the pre-existing, unrelated `_vercel/insights` 404 already present before this change.
- `/settings` as a guest — VERIFIED: renders correctly, same pre-existing console noise, no regression.
- The has-password and passwordless authenticated forms themselves were **not** manually clicked through in a real browser (would require a real signed-in session), consistent with this session's standing policy against creating or mutating real Supabase accounts — coverage for those states rests on the component tests above (INFERRED correct from tests, not independently browser-VERIFIED this pass).

## Remaining risks

- **UNKNOWN**: real end-to-end rendering of the has-password and passwordless authenticated states in a live browser — not attempted, same network/account-creation restriction as prior tasks in this session.
- Nothing else — this change touches no security-relevant code path.
