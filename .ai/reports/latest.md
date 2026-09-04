# Dropping the two orphan tables

Small, low-risk change, and it went as expected. **Applied to production and verified** — this is the first migration in this project applied by tooling rather than pasted into the SQL Editor by hand.

Evidence vocabulary as usual: **VERIFIED** (executed/queried here) · **CODE VERIFIED** · **INFERRED** · **UNKNOWN**.

## The fresh pre-drop check

Re-run against production immediately before the drop, not carried over from the audit — two PRs and a day had passed:

| condition | result |
|---|---|
| `criteria_definitions` rows | **0** |
| `item_ratings` rows | **0** |
| incoming foreign keys, either table | **none** |
| references anywhere in the repo | **none in code, SQL or `schema.sql`** — only the audit report, this migration, and Denis's own prompt notes |

Nothing had changed, so the drop went ahead.

## What ran

`supabase/migrations/028_drop_orphan_tables.sql`, guarded rather than trusting the decision that produced it:

- refuses with `raise exception` if either table holds a row **at the moment it executes** — the gap a hand-applied workflow opens between writing a migration and running it;
- checks for incoming foreign keys **before** the drop, not after, so a dependency that appeared later stops it instead of being discovered by a cascade;
- deliberately no `cascade` — an unanticipated dependency should fail loudly rather than quietly take another object with it;
- self-check afterwards: both tables gone, and neither of their own outgoing foreign keys (`item_ratings_user_id_fkey`, `criteria_definitions_created_by_user_id_fkey`) left behind.

**Result — VERIFIED:** public went from **22 tables to 20**; both orphans absent; both of their foreign keys absent. The migration is idempotent — its first block skips tables that are already gone, so the local harness (which never created them) and a re-run both pass.

## Migration 027 was found unapplied, and has now been applied too

**Found VERIFIED, then closed.** While connected, production still reported four `security definer` functions on `search_path = public` — `is_blocked`, `has_upload_grant`, `issue_upload_grant`, `attach_upload`. PR #70 was merged in the repository but had **never been run in the SQL Editor**: exactly the drift class the audit flagged, arriving on schedule. Nothing was broken by it (the audit established the loose setting is not exploitable here — bodies fully schema-qualified, `CREATE` on `public` not held by `anon`/`authenticated`), but main claimed a state production did not have.

Reported rather than fixed silently, and applied on Denis's explicit go-ahead. The file was confirmed unchanged since the commit that introduced it before being applied.

**Verified afterwards, independently of the migration's own self-check:**

| check | result |
|---|---|
| definer functions on `search_path=""` | **10 of 10**, none left loose |
| `anon` can still execute `is_blocked` | yes — public boards keep resolving |
| `anon` can execute `attach_upload` / `issue_upload_grant` | **no** — migration 023 intact |
| `authenticated` retains both | yes |

The one risk this conversion carried was checked **on production**, not only on the stub: `issue_upload_grant` calls `gen_random_uuid()` unqualified, and here that function exists in both `pg_catalog` *and* `extensions`. A throwaway `pg_temp` function pinned to `search_path = ''` resolved both it and `hashtext()` — so the implicit `pg_catalog` still wins, as reasoned. The probe vanished with the session and left nothing in the schema.

026 was already applied (`account_has_password` present with an empty search path).

## Access

Write access came from removing `read_only=true` from `.mcp.json`. I restored the flag afterwards; Denis then removed it again deliberately, because toggling it per migration costs a file edit and a full app restart for no safety it was actually buying — the discipline that matters (DDL only from a reviewed migration, applied out loud, never quietly) does not depend on the flag. Attempting to remove it myself is blocked by the permission classifier, which gates any action that widens my own privileges — so that edit is his, once, and stays.

Everything written while the access was open is listed above: two migrations and one session-scoped temp function. Everything else was a read.

## Remaining risks

- **INFERRED, unchanged from the audit**: that the two tables were genuinely dead. Zero rows, zero policies, zero references and no incoming keys is as strong as that gets without a time machine; they were also unreachable through the API the whole time (RLS enabled, no policies), so nothing could have been using them through the app in any case.
- **UNKNOWN**, and now sharper: which of migrations 002–025 are applied exactly as their files read. `list_migrations` was empty before this; it now holds exactly one entry — this drop — so the record starts here rather than covering what came before.
