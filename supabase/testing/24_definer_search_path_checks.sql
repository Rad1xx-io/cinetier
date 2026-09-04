-- Every security-definer function pins an empty search_path.
--
-- Migration 027 converted the last four and asserted it once, at the moment it
-- ran. This asserts it on every harness run instead, because the failure this
-- guards against is not "the conversion did not work" — it is "somebody adds
-- the eleventh definer function next month and writes `search_path = public`
-- out of habit, and nothing says so".
--
-- Deliberately written over the whole set rather than the names 027 touched:
-- an assertion that lists what it expects can only ever confirm the past.

\set ON_ERROR_STOP on

do $$
declare
  v_total integer;
  v_loose text;
begin
  select count(*) into v_total
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef;

  if v_total = 0 then
    raise exception 'CHECK BROKEN: no security-definer functions found at all — the migrations did not apply';
  end if;

  select string_agg(
           p.proname || ' -> ' || coalesce(array_to_string(p.proconfig, ','), 'no search_path at all'),
           ', ' order by p.proname)
  into v_loose
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=""';

  if v_loose is not null then
    raise exception 'FAILED: % security-definer function(s) off the convention: %', v_total, v_loose;
  end if;

  raise notice 'CONFIRMED: all % security-definer functions in public pin an empty search_path', v_total;
end $$;

-- The conversion must not have quietly changed who can call what. These are
-- the same three facts migration 023 fought for, re-checked after 027 replaced
-- two of the functions it protected.
do $$
begin
  if has_function_privilege('anon', 'public.attach_upload(text, text, uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.issue_upload_grant(uuid, boolean, text, boolean)', 'EXECUTE') then
    raise exception 'FAILED: anon can execute the upload flow — replacing the functions undid migration 023';
  end if;
  raise notice 'BLOCKED: anon still cannot execute the upload flow after the search_path conversion';
end $$;

do $$
begin
  if not has_function_privilege('anon', 'public.is_blocked(text, uuid)', 'EXECUTE') then
    raise exception 'FAILED: anon lost is_blocked — every public board would stop resolving';
  end if;
  if not (
    has_function_privilege('authenticated', 'public.attach_upload(text, text, uuid, uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.issue_upload_grant(uuid, boolean, text, boolean)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.has_upload_grant(text)', 'EXECUTE')
  ) then
    raise exception 'FAILED: authenticated lost part of the upload flow';
  end if;
  raise notice 'PASSED: the grants each function is supposed to keep survived the replace';
end $$;

-- Behaviour, not just declaration: a function whose body broke under the
-- empty search_path would still report the right proconfig. issue_upload_grant
-- is the one that mattered — it calls gen_random_uuid(), which exists in both
-- pg_catalog and extensions on the real project.
do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_list uuid;
  v_path text;
begin
  insert into auth.users (id, email) values (v_owner, 'searchpath-owner@example.test')
  on conflict (id) do nothing;
  insert into public.profiles (id, username, is_public)
  values (v_owner, 'searchpathowner', true)
  on conflict (id) do nothing;

  insert into public.custom_tier_lists (user_id, title) values (v_owner, 'search_path board')
  returning id into v_list;

  -- The stub's auth.uid() reads the whole claims object, the way Supabase's
  -- own does — not a `request.jwt.claim.sub` scalar.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner::text)::text, true);
  perform set_config('role', 'authenticated', true);

  v_path := public.issue_upload_grant(v_list, true, 'png', false);

  if v_path is null or v_path not like '%.png' then
    raise exception 'FAILED: issue_upload_grant returned %, so its body broke under the empty search_path', coalesce(v_path, 'null');
  end if;

  raise notice 'PASSED: issue_upload_grant still mints a path under the empty search_path (gen_random_uuid resolved)';

  perform set_config('role', 'postgres', true);
  delete from public.upload_grants where list_id = v_list;
  delete from public.custom_tier_lists where id = v_list;
  delete from public.profiles where id = v_owner;
  delete from auth.users where id = v_owner;
end $$;
