-- TierListOnline: finish what 030 started — views hold the same three
-- unused privileges its table loop never reached.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. 030 (2026-09-06) revoked REFERENCES, TRIGGER and
-- TRUNCATE from anon/authenticated on every table in `public`, looping over
-- `pg_class` rather than a list so it couldn't forget one added later. The
-- loop's own filter was `c.relkind = 'r'` — ordinary tables only. Its
-- self-check, right below that loop in the same file, asserts over
-- `information_schema.role_table_grants` with no such filter — every object
-- Postgres will show a grant for, tables and views alike. Two views in
-- `public` — `post_feed` (009/021) and `public_profile_sitemap` (011), both
-- older than 030 — carry the same Supabase default grant a table does, so
-- the loop never touched them and the self-check 030 ships with has been
-- failing on every real attempt to run it, correctly, exactly as designed.
--
-- WHY THIS WENT UNNOTICED FOR FIVE DAYS. Not "forgot to run it" — attempting
-- to apply 030 as committed reproduces this failure every time, deterministically,
-- confirmed while working this migration. 030's transaction rolls back whole on
-- that exception, so no environment was ever left half-revoked; there was just
-- nothing to show for it either. The local harness could never have caught
-- this: 26_table_privilege_checks.sql says so in its own header — its
-- platform stub does not reproduce Supabase's default per-object grants at
-- all, so the file's real assertion passes on a database that never had
-- anything to revoke in the first place. That file protects its own query
-- logic (grant a scratch table the privilege, prove the detector finds it)
-- but nothing locally can exercise whether a real default grant actually
-- gets revoked. Only a real Supabase database — a preview branch or
-- production — could ever have surfaced this, and nothing prompted a retry
-- once 030 was written and documented: its own header says plainly there is
-- no live exploit, so a failed, silent, no-op attempt carried no signal that
-- would pull someone back to it.
--
-- WHY A NEW FILE, NOT AN EDIT TO 030. 030 has already run — without error,
-- every time the local test harness rebuilds from empty — which is the same
-- "already applied, even locally" bar this repo holds edits to elsewhere
-- (033's header makes the same call). What changed there was real query
-- logic; here it is only which relkind values a loop that never observably
-- fires locally happens to include, but the rule is simpler to keep
-- unconditional than to keep re-deriving when the exception applies.
--
-- WHAT THIS DOES: the identical revoke, over `relkind in ('r', 'v')` instead
-- of `'r'` alone, across all of `public` again rather than the two named
-- views specifically — for the same reason 030 gave for looping over a list:
-- a loop cannot forget a view added later, either. Idempotent with 030 by
-- construction (`revoke ... from` a role that never held the privilege is a
-- no-op, not an error), so this is safe to run whether or not a given table
-- already lost these three from 030, or never did.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — this is not the right database.';
  end if;
end $$;

-- ---------------------------------------------------------------- revoke ----

do $$
declare
  v_rel text;
  v_count integer := 0;
begin
  for v_rel in
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v')
    order by 1
  loop
    execute format('revoke references, trigger, truncate on %s from anon, authenticated', v_rel);
    v_count := v_count + 1;
  end loop;

  raise notice 'TierListOnline: revoked references, trigger and truncate on % relations (tables and views).', v_count;
end $$;

-- ------------------------------------------------------------- self-check --

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

  -- Same reads 030 already protects, unchanged by widening the loop to
  -- views — SELECT/INSERT/DELETE were never touched by either migration.
  select string_agg(t, ', ') into v_broken
  from unnest(array['posts', 'custom_items', 'profiles', 'ranked_titles', 'post_feed', 'public_profile_sitemap']) as t
  where not has_table_privilege('anon', 'public.' || t, 'SELECT');

  if v_broken is not null then
    raise exception 'TierListOnline: anon lost SELECT on % — the revoke went too far.', v_broken;
  end if;

  if not (
    has_table_privilege('authenticated', 'public.posts', 'INSERT')
    and has_table_privilege('authenticated', 'public.custom_tier_rows', 'DELETE')
  ) then
    raise exception 'TierListOnline: authenticated lost a write the app actually makes.';
  end if;

  raise notice 'TierListOnline: no relation in public — table or view — grants references, trigger or truncate to anon or authenticated.';
end $$;
