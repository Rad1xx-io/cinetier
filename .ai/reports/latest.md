# "Change your password" shown on a supposedly passwordless account

**Branch 1 of the two: this is not a bug. The account genuinely has a password.** `encrypted_password` for `den4ik6447@gmail.com` is a real bcrypt hash — **60 characters, `$2a$` prefix** — not null, not an empty string, not a placeholder. The RPC returned `true` because `true` is the correct answer, and the UI rendered the correct form for it. **No code changed.**

Evidence vocabulary as usual: **VERIFIED** (queried against production) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## The evidence, queried against production

| fact | value | source |
|---|---|---|
| `encrypted_password` | **hash, 60 chars, `$2a$` prefix** | VERIFIED — `auth.users` |
| account created | 2026-08-11 21:42 UTC | VERIFIED |
| account last updated | **2026-09-03 22:39 UTC** | VERIFIED |
| identities | **`email`, `google`** | VERIFIED — `auth.identities` |
| live RPC predicate | `encrypted_password is not null` (migration 026 is the live definition) | VERIFIED |
| grants in production | `anon` = **false**, `authenticated` = **true** | VERIFIED |

`$2a$` is bcrypt's own version marker and 60 characters is bcrypt's exact output length, so this is a genuine, usable hash rather than something a code path left behind. (The hash itself was deliberately never printed — length and a four-character prefix answer the question without moving credential material into a chat log.)

**What it means for Denis:** that account has a password, set on the evening of 2026-09-03. The right move is **"Forgot password"** on the sign-in screen (or simply the password set that evening) — not "set a password", which is precisely what the page correctly declined to offer.

**INFERRED, not proven:** *which* action set it. `updated_at` moves on other updates too, so the timestamp alone does not name the culprit. But the combination — an `email` identity beside the Google one, plus a real bcrypt hash, on an account created three weeks earlier — means a password was set at some point, and the timestamp falls inside the window when the password-signup (#63) and set-a-password (#65/#66) flows were being tested. Read charitably, this is those features working: the account crossed from passwordless to having a password, and the page then correctly stopped offering to set one.

## The population-wide answer, since one account was never the question

Denis's concern was that a fix must serve every user, not one email. The population query answers it directly, and the answer is that **no user is currently mis-served**:

| `encrypted_password` state | users | providers seen |
|---|---|---|
| real hash | 2 | `email` (1), `google` (2) |
| `null` | 2 | `google` (2) |
| **empty string** | **0** | — |

(Users holding two identities appear under both providers, which is why the per-provider counts exceed the totals.)

**The empty-string hypothesis is refuted for this project — VERIFIED.** That was the one mechanism that would have made `is not null` wrong, and it does not occur here: every account in the database is either a real hash or a true `null`. So migration 026's predicate returns the correct answer for **every** account currently present, across all three signup paths this app supports (password, magic link, Google).

## What this did expose, without being a bug

The harness checks for migration 026 (`supabase/testing/23_account_has_password_checks.sql`) pin exactly two shapes: a hash → `true`, and `null` → `false`. **The empty-string shape was never tested** (CODE VERIFIED), and the fixture even carries a comment asserting, as an assumption, that a Google or magic-link account is `null` "exactly the way it would be on a real Supabase project". That assumption has now been checked against production for the first time and **held** — but it held by verification, not by the reasoning that originally put it there.

Left alone deliberately, per the brief's instruction not to change code on this branch. Worth knowing it is available as cheap insurance if Denis wants it later: treating an empty or whitespace-only value as "no password" (`nullif(trim(encrypted_password), '') is not null`) is correct under any signup path — an empty string is never a usable hash — and would make the predicate robust to a future GoTrue version that populates the column differently. That is a decision to take deliberately, not a fix to smuggle in under a report that just concluded nothing is broken.

## Remaining risks

- **UNKNOWN**: whether a future Supabase/GoTrue version, or a signup path not yet used here, could write an empty string. Nothing in the current data suggests it does. Today's evidence is four accounts, which is the whole user base but still a small sample — the conclusion is exact for the present, not a guarantee about future rows.
- Nothing else. No code, migration, grant or test was changed by this investigation.
