-- No app table hands `anon` or `authenticated` a privilege the app never uses.
--
-- Migrations 030 and 035 revoke REFERENCES, TRIGGER and TRUNCATE, which
-- Supabase grants by default on every table and view in `public` and which
-- nothing here has ever needed. TRUNCATE is the one worth naming: it is not
-- subject to row-level security, so a role holding it empties a table
-- whatever the policies say. Two migrations, not one, because 030's own
-- revoke loop only covered ordinary tables (relkind 'r') and missed the two
-- views already in `public` at the time — 035 closes that gap; see its
-- header and the 2026-09-11 DECISIONS.md entry for how that was found.
--
-- A WARNING ABOUT WHAT THIS FILE PROVES LOCALLY. The harness's platform stub
-- does not grant those three in the first place, so the final assertion below
-- would pass on an empty database, against a broken migration, or with the
-- migration deleted entirely — it would be a check that cannot fail, which is
-- worse than no check at all because it reads like coverage.
--
-- So it proves its own detector first: a scratch table is created, given the
-- exact privilege the real assertion looks for, and the detector is required to
-- find it. Only then is the real state asserted. If the detector is ever broken
-- or narrowed, the first half fails and says so, instead of the second half
-- passing quietly.

\set ON_ERROR_STOP on

-- --------------------------------- the detector has to detect something ----

begin;

create table public.privilege_probe (id integer);
grant truncate on public.privilege_probe to anon;
grant references on public.privilege_probe to authenticated;

do $$
declare
  v_found text;
begin
  select string_agg(distinct g.grantee || ':' || g.privilege_type, ', ')
  into v_found
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.table_name = 'privilege_probe'
    and g.grantee in ('anon', 'authenticated')
    and g.privilege_type in ('REFERENCES', 'TRIGGER', 'TRUNCATE');

  if v_found is null then
    raise exception 'CHECK BROKEN: the detector missed a privilege that was granted on purpose';
  end if;
  if v_found not like '%anon:TRUNCATE%' or v_found not like '%authenticated:REFERENCES%' then
    raise exception 'CHECK BROKEN: the detector found "%", not what was granted', v_found;
  end if;

  raise notice 'CONTROL PASSED: the detector finds these privileges when they are really there';
end $$;

rollback;

-- ------------------------------------------------ and now the real state ---

do $$
declare
  v_left text;
  v_tables integer;
begin
  select count(*) into v_tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';

  if v_tables = 0 then
    raise exception 'CHECK BROKEN: no tables in public — the migrations did not apply';
  end if;

  select string_agg(distinct g.table_name || ' (' || g.grantee || ': ' || g.privilege_type || ')', ', ')
  into v_left
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated')
    and g.privilege_type in ('REFERENCES', 'TRIGGER', 'TRUNCATE');

  if v_left is not null then
    raise exception 'FAILED: % still grant(s) an unused privilege: %', v_tables, v_left;
  end if;

  raise notice 'CONFIRMED: none of the % tables in public grants references, trigger or truncate to anon or authenticated', v_tables;
end $$;

-- ------------------------------------- what must NOT have been revoked -----

do $$
declare
  v_broken text;
begin
  select string_agg(t, ', ') into v_broken
  from unnest(array['posts', 'custom_items', 'profiles', 'ranked_titles', 'post_view_marks']) as t
  where not has_table_privilege('anon', 'public.' || t, 'SELECT');

  if v_broken is not null then
    raise exception 'FAILED: anon lost SELECT on % — a revoke went too wide', v_broken;
  end if;

  if not (
    has_table_privilege('authenticated', 'public.posts', 'INSERT')
    and has_table_privilege('authenticated', 'public.custom_tier_rows', 'DELETE')
  ) then
    raise exception 'FAILED: authenticated lost a write the app actually makes';
  end if;

  raise notice 'PASSED: every privilege the app does use survived';
end $$;
