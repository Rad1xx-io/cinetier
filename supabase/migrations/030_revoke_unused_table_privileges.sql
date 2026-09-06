-- TierListOnline: take back three privileges the app has never used.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. Finding 2 of the 2026-09-06 migration audit
-- (.ai/reports/sql-audit.md) recorded that every table in `public` grants
-- REFERENCES, TRIGGER and TRUNCATE to `anon` and `authenticated`, and that no
-- migration in this repository ever asked for them. They are Supabase's own
-- default privileges for a new project, applied to every table and never
-- revoked. The argument for removing them is in that finding and is not
-- re-made here; this is the migration that acts on it.
--
-- What this is NOT. There is no live exploit being closed. PostgREST never
-- issues TRUNCATE, and neither role can reach one through the app, so the
-- anon key does not expose this. What it is: the same rule every other
-- migration here already follows — 016's column grants, 023's explicit
-- `revoke ... from anon`, 029's `revoke delete` — that a privilege the app
-- does not use should not be sitting there for the next person to wonder
-- about. TRUNCATE is worth naming specifically because it is not subject to
-- row-level security: a role holding it empties a table regardless of policy,
-- so it is the one of the three that would matter most if a direct database
-- connection with those roles ever existed.
--
-- Written over every table in `public` rather than a list, deliberately. The
-- audit's own Finding 2 named nineteen tables and missed `post_view_marks`
-- (migration 018) — a list is exactly the thing that goes stale, and the same
-- lesson the test harness learned when its allowlist silently skipped
-- migrations. A loop cannot forget a table that was added later.
--
-- What this does not prevent. Supabase's default privileges are unchanged, so
-- a table created after this runs will be granted all three again. That is
-- left alone on purpose: narrowing the platform's defaults is a wider change
-- than this finding justifies, and it is how `anon` and `authenticated` get
-- the SELECT they legitimately need on new tables. The guard against that is
-- the standing check in supabase/testing, not this file.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — this is not the right database.';
  end if;
end $$;

-- ---------------------------------------------------------------- revoke ----

do $$
declare
  v_table text;
  v_count integer := 0;
begin
  for v_table in
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by 1
  loop
    execute format('revoke references, trigger, truncate on %s from anon, authenticated', v_table);
    v_count := v_count + 1;
  end loop;

  raise notice 'TierListOnline: revoked references, trigger and truncate on % tables.', v_count;
end $$;

-- ------------------------------------------------------------- self-check --

/*
 * Asserted over every table again rather than over the ones the loop happened
 * to visit: the point is the state of the database afterwards, not that the
 * loop ran. The second half is the half that matters as much — the privileges
 * the app genuinely uses must still be there, or this migration would have
 * quietly broken every read.
 */
do $$
declare
  v_left text;
  v_broken text;
begin
  select string_agg(distinct g.table_name || ' (' || g.grantee || ': ' || g.privilege_type || ')', ', ')
  into v_left
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated')
    and g.privilege_type in ('REFERENCES', 'TRIGGER', 'TRUNCATE');

  if v_left is not null then
    raise exception 'TierListOnline: these privileges survived the revoke: %.', v_left;
  end if;

  -- The reads the app depends on. `posts` is public and `custom_items` is the
  -- one 016 and 029 narrowed hardest, so if a revoke went too wide it shows
  -- here first.
  select string_agg(t, ', ') into v_broken
  from unnest(array['posts', 'custom_items', 'profiles', 'ranked_titles']) as t
  where not has_table_privilege('anon', 'public.' || t, 'SELECT');

  if v_broken is not null then
    raise exception 'TierListOnline: anon lost SELECT on % — the revoke went too far.', v_broken;
  end if;

  if not has_table_privilege('authenticated', 'public.posts', 'INSERT') then
    raise exception 'TierListOnline: authenticated can no longer publish a post.';
  end if;

  raise notice 'TierListOnline: no app table grants references, trigger or truncate to anon or authenticated.';
end $$;
