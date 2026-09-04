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

## One thing found while connected — migration 027 is not applied

**VERIFIED, and it is not a consequence of this change.** Production still reports four `security definer` functions on `search_path = public` — `is_blocked`, `has_upload_grant`, `issue_upload_grant`, `attach_upload`. Six are on `search_path=""`.

So PR #70 is merged in the repository but **was never run in the SQL Editor**. Nothing is broken by this: the audit already established the loose setting is not exploitable here (bodies fully schema-qualified, and `CREATE` on `public` is not held by `anon`/`authenticated`). But main currently claims a state production does not have — exactly the drift class the audit flagged, arriving on schedule.

026 is applied (`account_has_password` present with an empty search path). Not applied on my own initiative: applying 027 is a separate production change from the one that was asked for, and it takes one call whenever Denis says so.

## Access

Write access was granted specifically for this drop by removing `read_only=true` from `.mcp.json`, and **has been put back** in the file — it takes effect at the next app restart. Nothing else was written while it was open: the drop, plus read-only queries.

## Remaining risks

- **INFERRED, unchanged from the audit**: that the two tables were genuinely dead. Zero rows, zero policies, zero references and no incoming keys is as strong as that gets without a time machine; they were also unreachable through the API the whole time (RLS enabled, no policies), so nothing could have been using them through the app in any case.
- **UNKNOWN**, and now sharper: which of migrations 002–025 are applied exactly as their files read. `list_migrations` was empty before this; it now holds exactly one entry — this drop — so the record starts here rather than covering what came before.
