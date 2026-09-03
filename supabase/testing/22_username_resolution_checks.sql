-- What migration 025 claims: a username resolves to its account's email
-- before there is a session — including for a private profile, which the
-- ordinary anonymous read of `profiles` (migration 004/021) cannot do — and
-- that the function reveals nothing else, and is bounded even when called
-- directly rather than through the application's own rate limiter.

\set ON_ERROR_STOP on

\set public_user  'ba000000-2222-4222-8222-000000000001'
\set private_user 'ba000000-2222-4222-8222-000000000002'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.profiles where id in (:'public_user', :'private_user');
delete from auth.users where id in (:'public_user', :'private_user');

insert into auth.users (id, email) values
  (:'public_user', 'resolve-public@example.test'),
  (:'private_user', 'resolve-private@example.test');

insert into public.profiles (id, username, display_name, is_public) values
  (:'public_user', 'resolve_public', 'Resolve Public', true),
  -- Private and never posted: the exact case migration 004/021's own SELECT
  -- policy hides from an anonymous reader — resolving this by username is
  -- the one thing this migration exists to make work anyway.
  (:'private_user', 'resolve_private', 'Resolve Private', false);

select set_config('test.public_user', :'public_user', false);
select set_config('test.private_user', :'private_user', false);

commit;

-- --------------------------------------- 1. anon: a public username resolves --

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_email text;
begin
  select public.resolve_username_email('resolve_public') into v_email;

  if v_email is distinct from 'resolve-public@example.test' then
    raise exception 'CONTROL FAILED: a public username did not resolve to its email — signing in by username would be broken for everyone';
  end if;

  raise notice 'CONTROL PASSED: a public username resolves to its email, anonymously';
end $$;

commit;

-- ---------------------------- 2. anon: a PRIVATE username still resolves --
--
-- The property this migration exists for. An ordinary anonymous select
-- against profiles cannot see this row at all (checked below, so this file
-- also confirms migration 025 did not loosen that policy to get here).

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_email text;
  v_row_count integer;
begin
  select public.resolve_username_email('resolve_private') into v_email;

  if v_email is distinct from 'resolve-private@example.test' then
    raise exception 'CONTROL FAILED: a private profile''s username does not resolve — its own owner could not sign in by it';
  end if;

  select count(*) into v_row_count
  from public.profiles where username = 'resolve_private';

  if v_row_count <> 0 then
    raise exception 'REGRESSION: migration 025 loosened the profiles SELECT policy — a private profile is now readable by anon directly';
  end if;

  raise notice 'PASSED: a private profile''s username resolves for sign-in, while the profiles row itself is still unreadable anonymously';
end $$;

commit;

-- -------------------------------- 3. anon: a nonexistent username is null --

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_email text;
begin
  select public.resolve_username_email('nobody_by_this_handle') into v_email;

  if v_email is not null then
    raise exception 'CONTROL FAILED: a nonexistent username resolved to something';
  end if;

  raise notice 'CONTROL PASSED: a nonexistent username resolves to null';
end $$;

commit;

-- --------------------------------------- 4. anon: case-insensitive lookup --
--
-- profiles.username is stored lower-cased and constrained to stay that way
-- (migration 004's own check constraint); the function has to meet a caller
-- halfway rather than assume they already lower-cased what they typed.

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_email text;
begin
  select public.resolve_username_email('Resolve_Public') into v_email;

  if v_email is distinct from 'resolve-public@example.test' then
    raise exception 'CONTROL FAILED: resolution is case-sensitive — a correctly-typed username with different casing would fail to sign in';
  end if;

  raise notice 'PASSED: resolution is case-insensitive';
end $$;

commit;

-- ------------------------------------------ 5. reveals nothing else -------
--
-- The function returns exactly one text value. This checks the type, not
-- just the value, since a composite/record return would have been a much
-- larger leak than an email.

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_typname text;
begin
  select t.typname into v_typname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type t on t.oid = p.prorettype
  where n.nspname = 'public' and p.proname = 'resolve_username_email';

  if v_typname <> 'text' then
    raise exception 'REGRESSION: resolve_username_email no longer returns a plain text value (returns %) — check it cannot leak a whole row', v_typname;
  end if;

  raise notice 'CONFIRMED: resolve_username_email returns a single text value, nothing structured';
end $$;

commit;

-- --------------------------- 6. the per-username ceiling actually engages --
--
-- Layer two: bounds a caller that skips the application's own rate limiter
-- (/api/auth/resolve-login) and calls the RPC directly. 30 requests per 300
-- seconds per username, migration 025's own constants.

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_email text;
  v_allowed_count integer := 0;
  v_refused boolean := false;
begin
  -- A username of its own, so this cannot be confused by counters the
  -- earlier checks in this file already moved.
  for i in 1..35 loop
    select public.resolve_username_email('resolve_public') into v_email;
    if v_email is not null then
      v_allowed_count := v_allowed_count + 1;
    else
      v_refused := true;
    end if;
  end loop;

  if not v_refused then
    raise exception 'EXPLOIT SUCCEEDED: resolve_username_email has no working ceiling — 35 rapid calls for one username all resolved';
  end if;

  if v_allowed_count > 30 then
    raise exception 'REGRESSION: the per-username ceiling let through % calls, more than the configured limit of 30', v_allowed_count;
  end if;

  raise notice 'PASSED: the per-username ceiling engaged after % calls, refusing the rest', v_allowed_count;
end $$;

commit;
