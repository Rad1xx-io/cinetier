# SQL and Supabase audit — findings, fixes, and the live drift check

Kept separate from `latest.md` on purpose: that file is overwritten per task, and this is a standing record of what the database layer was checked for and what came back.

Evidence vocabulary: **VERIFIED** (executed/measured here) · **CODE VERIFIED** (read, no runtime instrument) · **INFERRED** · **UNKNOWN**.

## What was checked, and what came back clean

Worth stating first, because most of an audit's value is knowing which suspicions were retired:

| surface | result |
|---|---|
| RLS coverage | **VERIFIED clean** — 18 tables created across the migrations, 18 with `enable row level security`. Exact match, none forgotten. |
| base schema | **CODE VERIFIED** — `ranked_titles`/`ranked_channels` live in `supabase/schema.sql`, not a numbered migration. Looked like a missing `001` until migration 005's own guard turned up, which fails with "run supabase/schema.sql first". A convention, not a gap. |
| upsert keys | **CODE VERIFIED** — `unique (user_id, tmdb_id, media_type)` and `unique (user_id, channel_id)` match the `onConflict` strings the sync code passes. This is what PR #69's batched push stands on. |
| unbounded growth | **CODE VERIFIED** — `rate_limits` and `post_view_marks` are pruned inside their own functions; no external scheduler to forget. |
| function grants | **VERIFIED** — every definer function that should be `authenticated`-only carries an *explicit* `revoke … from anon` (migration 023's lesson: `revoke from public` leaves anon's default-privilege grant alone). |
| `has_upload_grant` reachable by anon | **not a finding.** It was the first thing that looked like one. Migration 023 already documents the decision: the storage INSERT policy calls it and is evaluated as the caller, so revoking would turn a clean row-level refusal into a permission error. And for anon it is a constant `false` — `auth.uid()` is null. Checked before writing it down. |

## Finding 1 — the test harness silently skipped unlisted migrations

**VERIFIED.** `supabase/testing/run.sh`'s normal-mode loop iterated every file in `migrations/*.sql`, but the `case` inside applied only names matching an explicit allowlist. Anything unlisted fell through: no error, no warning, no exit code — just fewer checks than the run appeared to perform. The script's own comment already recorded this biting once for real (013 and its check file went unrun for a long stretch), and 026 came within a forgotten line of repeating it.

**Why the exclusions existed — measured, not assumed.** Every excluded migration was applied to the stub by hand before deciding anything:

| migration | applies to the stub? |
|---|---|
| 002, 003, 005, 006, 007, 008, 010 | **yes, cleanly** — never added, no reason |
| 011 | **no** — `column p.updated_at does not exist` |

So seven of the eight were plain neglect. Exactly one has a real, checkable reason, and it is one the repo already documents from the other side: `00_platform.sql`'s abbreviated `profiles` stand-in has no `updated_at`, and because 004 uses `create table if not exists`, the stub wins and the real definition never runs. `--fresh` mode does apply 011, so it is covered where the schema is real.

That made the brief's first option the right one: **the default is inverted.** Every migration runs unless it is named in `EXCLUDED_MIGRATIONS` with a stated reason — currently one entry.

**Before and after, concretely.** A throwaway `027_probe_unlisted.sql` was created and run through both behaviours:

| | old (allowlist) | new (opt-out) |
|---|---|---|
| unlisted migration, valid | matched no `case` arm → **silent no-op**, exit 0 | **applied** — its `raise notice` appears in the run |
| unlisted migration, broken | same silent no-op, exit 0 | **exit 3**, with `ERROR: relation "table_that_does_not_exist" does not exist` |

The probe file was deleted afterwards.

**The exclusion list checks itself.** A list nobody re-examines is how this script got into trouble, so after the checks it re-applies each excluded migration: if one now succeeds, the run fails with `STALE EXCLUSION: … applies cleanly now`. **VERIFIED** by temporarily excluding 002 (which does apply cleanly) — exit 1, correct message, restored.

**The check files had the same defect and the same fix.** The explicit list on line 116 meant a new check file nobody remembered to add simply never ran — the precise story of 013. It is now `[0-9][0-9]_*_checks.sql`, which cannot forget; `00_platform.sql` and `20_negative_control.sql` do not match the pattern, which is what keeps them out of a normal run.

## Finding 2 — four definer functions were off the search_path convention

**VERIFIED against production, not just the files.** Ten `security definer` functions exist in `public`. Six pinned `search_path=""`; four — `is_blocked`, `has_upload_grant`, `issue_upload_grant` (012) and `attach_upload` (016) — pinned `search_path=public`. The split was not a decision; it is the order they were written in, before 016/017 adopted the stricter convention and said so in their own comments.

**Not a live vulnerability, and that was checked rather than assumed.** All four bodies are already fully schema-qualified, so they never relied on the search path resolving anything; and shadowing a name needs `CREATE` on `public`, which `anon` and `authenticated` do not hold. What the loose setting costs is the layer *under* that reasoning — the one that keeps holding when a later edit adds an unqualified name.

**One real trap, found by checking rather than by reading.** `issue_upload_grant` calls `gen_random_uuid()` unqualified, and on this project that function exists in **both `pg_catalog` and `extensions`** (**VERIFIED** by querying `pg_proc` on production). Under an empty search path it still resolves, because `pg_catalog` is searched implicitly and first — the same one that wins today. `hashtext()` and `pg_advisory_xact_lock()` are `pg_catalog`-only. `attach_upload` was read line by line before conversion, including both `storage.objects` references: everything is qualified, so it was converted too rather than deferred.

**A second trap the new check caught immediately.** Migration 027 converted the four and its own self-check passed — and then the harness failed, reporting all four back on `search_path=public`. Cause: `16_migration_idempotency_checks.sql` deliberately re-applies migration 012 to prove it is safe to re-run, and 012's own definitions came back with it. That is the same shape of bug that file was written to catch in the first place (012 restoring a policy 013 had fixed), and the repo already has a precedent for the answer: 012 was edited in place then. So the same was done here — **027 changes production, and 012/016 were edited so that re-running them cannot undo it.** Without the standing check this would have shipped looking correct and silently reverted on the next idempotency run.

`009`'s `increment_post_views` still reads `search_path = public` in its file and was deliberately left alone: 018 drops that overload outright (`drop function if exists public.increment_post_views(uuid)`) and asserts exactly one remains; production confirms only the two-argument version exists. If it ever came back, the new standing check would name it.

**New standing check.** `supabase/testing/24_definer_search_path_checks.sql` asserts the convention over *every* definer function in `public` rather than the four this touched — an assertion that lists what it expects can only confirm the past. It also re-checks the grants 023 fought for, and exercises `issue_upload_grant` for real to prove the body still works under the empty path rather than merely declaring the right `proconfig`. It was picked up automatically by the glob from Finding 1, which is the first dividend of that change.

**Negative control — run, then reverted:** putting `is_blocked` back on `search_path = public` failed the run at exit 3 with the function named.

## Verification

| check | result |
|---|---|
| harness, normal mode | **exit 0, 105 assertions** (was 101 — the new check file adds 4) |
| harness, `--fresh` | `every migration applies to an empty database`, now including 027 |
| negative control: unlisted broken migration | exit 3, loud error (was: silent, exit 0) |
| negative control: stale exclusion | exit 1, names the migration |
| negative control: one function reverted to `search_path = public` | exit 3, names the function |

## The live drift check

Run once the Supabase MCP was reachable again. Read-only throughout (`transaction_read_only = on`).

**Which migrations are applied — UNKNOWN by record, VERIFIED by inspection.** `list_migrations` returns **empty**: this project applies migrations by hand in the SQL Editor, so Supabase's own migration table (which only the CLI populates) has no rows. There is no record in the database of what has been run. Applied state had to be inferred from the objects themselves — and by that measure the recent chain is live: `increment_post_views` exists only in its two-argument (018) form, `delete_custom_board` (024), `resolve_username_email` (025) and `account_has_password` (026) all exist, and the definer/`search_path` split matched the files exactly.

**Function drift: none.** Every `security definer` function in production corresponds to one the repo defines, with the argument signatures the files declare. Nothing hand-written, nothing orphaned, no unexpected overloads.

**Table drift: two orphans — VERIFIED.**

| table | rows | RLS | policies | referenced anywhere in the repo |
|---|---|---|---|---|
| `criteria_definitions` | 0 | enabled | **0** | no |
| `item_ratings` | 0 | enabled | **0** | no |

Neither is created by any migration or by `schema.sql`, and a search across the whole repository — code, SQL, docs — returns **zero** references. Their columns place them: `item_ratings (user_id, item_id, overall_tier, overall_score)` is a precursor of `ranked_titles`; `criteria_definitions (name, category, icon, is_custom, created_by_user_id)` predates the criteria feature that shipped as `criteria_scores` in 005. Leftovers from an early iteration, made by hand and never removed.

**Not a security hole, and that is worth being precise about.** Both have RLS *enabled* with *zero* policies, which is deny-all for `anon` and `authenticated` — the table-level grants they carry are irrelevant while no policy admits anyone. Both are empty. So the exposure is nil; what they cost is honesty about what the schema is.

**Not touched.** They are production objects, the connection is read-only by design, and dropping tables is not something to do inside an audit. The recommendation is to drop them once Denis confirms they are the leftovers they appear to be — or, if either is wanted, to write it into a migration so the repo stops disagreeing with the database.

## Remaining risks

- **UNKNOWN**: whether every *older* migration (002–017) is applied in production exactly as its file reads. The recent chain was confirmed object by object, but there is no applied-migrations record to compare against, and reconstructing each one's full effect from live objects was out of proportion here. The two orphan tables show hand edits did happen historically.
- **INFERRED**: that the two orphan tables are dead. Their emptiness and the total absence of references make it a strong reading, but only Denis can confirm nothing external touches them.
- The migration-by-hand workflow itself is what makes drift possible and unrecorded. Not proposing a change to it here — it is a real trade-off, and the SQL Editor step is also what keeps schema changes deliberate — but it is the reason this section had to infer rather than read.
