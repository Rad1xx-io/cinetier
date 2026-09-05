-- TierListOnline: remove two tables nothing has used since before the app shipped.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. `public.criteria_definitions` and
-- `public.item_ratings` exist in production and in no migration, and no version
-- of this repository has ever created them — they were made by hand during an
-- early iteration and never removed. Their columns say what they were:
-- `item_ratings (user_id, item_id, overall_tier, overall_score)` is the shape
-- `ranked_titles` ended up with, and `criteria_definitions (name, category,
-- icon, is_custom, created_by_user_id)` predates the criteria feature that
-- shipped as `criteria_scores` in migration 005.
--
-- The case for dropping them, as it stood when this was written (see
-- .ai/reports/sql-audit.md for the full audit):
--
--   * zero rows in either, re-checked against production immediately before
--     this file was written, not carried over from the audit;
--   * zero incoming foreign keys — nothing anywhere points at them, so this
--     drops no other object's dependency;
--   * zero RLS policies, with row-level security enabled — which means they
--     were already deny-all and unreachable through PostgREST, by anon and
--     authenticated alike. Removing them changes no access;
--   * zero references anywhere in the repository — code, SQL, docs.
--
-- Their own outgoing foreign keys both point at `auth.users`
-- (`item_ratings_user_id_fkey`, `criteria_definitions_created_by_user_id_fkey`)
-- and go away with the tables.
--
-- Why the guard below exists anyway. Migrations here are applied by hand in the
-- SQL Editor, so an arbitrary amount of time passes between writing this and
-- running it — and "the audit said it was empty" is a statement about the past.
-- If a row has appeared by the time this actually executes, that is evidence
-- something started using the table, and the right answer is to stop and look
-- rather than to drop it. An empty table costs nothing to check.

do $$
declare
  v_table text;
  v_rows bigint;
  v_refs text;
begin
  foreach v_table in array array['criteria_definitions', 'item_ratings'] loop
    if to_regclass('public.' || v_table) is null then
      -- Already gone: a re-run, or a database that never had them — the local
      -- test harness builds exactly that, since no migration ever created them.
      raise notice 'TierListOnline: public.% is already absent, nothing to drop.', v_table;
      continue;
    end if;

    execute format('select count(*) from public.%I', v_table) into v_rows;
    if v_rows > 0 then
      raise exception
        'TierListOnline: public.% holds % row(s) — refusing to drop it. It was empty when this migration was written, so something has started using it since; find out what before running this.',
        v_table, v_rows;
    end if;

    -- Checked before the drop, not after: a foreign key pointing here would
    -- mean another table depends on this one, and the audit's "nothing
    -- references them" would have gone stale.
    select string_agg(c.conrelid::regclass::text || ' (' || c.conname || ')', ', ')
    into v_refs
    from pg_constraint c
    where c.contype = 'f' and c.confrelid = ('public.' || v_table)::regclass;

    if v_refs is not null then
      raise exception
        'TierListOnline: % still references public.% — repoint or drop that first.',
        v_refs, v_table;
    end if;
  end loop;
end $$;

-- Deliberately without `cascade`. If some dependency exists that the guard
-- above did not anticipate, this should fail loudly rather than quietly take
-- that object with it.
drop table if exists public.criteria_definitions;
drop table if exists public.item_ratings;

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_left text;
begin
  select string_agg(t, ', ') into v_left
  from unnest(array['criteria_definitions', 'item_ratings']) as t
  where to_regclass('public.' || t) is not null;

  if v_left is not null then
    raise exception 'TierListOnline: % still exists after the drop.', v_left;
  end if;

  -- Nothing else should have been holding a constraint on them, so nothing
  -- else should now be missing one. Named constraints, checked by name, so a
  -- half-finished drop cannot pass this.
  if exists (
    select 1 from pg_constraint
    where conname in ('item_ratings_user_id_fkey', 'criteria_definitions_created_by_user_id_fkey')
  ) then
    raise exception 'TierListOnline: a foreign key from a dropped table survived it — the drop did not complete.';
  end if;

  raise notice 'TierListOnline: the two orphan tables are gone, and nothing else needed cleaning up after them.';
end $$;
