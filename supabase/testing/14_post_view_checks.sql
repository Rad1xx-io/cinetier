-- What migration 018 claims, checked against a running Postgres.
--
-- The finding: `increment_post_views` was security definer, granted to `anon`,
-- and had no memory. One POST to /rest/v1/rpc/increment_post_views moved the
-- counter, and nothing stopped the next one. The only guard was a React ref,
-- which is not a guard — nothing obliges an attacker to use the browser.
--
-- Everything below calls the function the way an attacker would: directly, as
-- `anon`, with whatever arguments suit. There is no application in the loop,
-- which is the point — this is the layer that has to hold when the route is
-- skipped entirely.
--
-- Note on the per-post ceiling: 300 an hour is deliberately far above what this
-- site's traffic produces, so the checks that exercise it drive it on purpose
-- rather than pretending a realistic visit would.

\set ON_ERROR_STOP on

\set author 'aa555555-5555-4555-8555-555555555501'
\set reader 'aa555555-5555-4555-8555-555555555502'
\set post   'dd555555-0000-4000-8000-000000000501'
\set ghost  'dd555555-0000-4000-8000-0000000009ff'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.post_view_marks;
delete from public.rate_limits;
delete from public.posts where id = :'post';
delete from public.profiles where id in (:'author', :'reader');
delete from auth.users where id in (:'author', :'reader');

insert into auth.users (id, email) values
  (:'author', 'view-author@example.test'),
  (:'reader', 'view-reader@example.test');
insert into public.profiles (id, username, is_public) values
  (:'author', 'view_author', true),
  (:'reader', 'view_reader', true);

insert into public.posts (id, user_id, title, description, category)
values (:'post', :'author', 'A post to look at', '', 'movie');

select set_config('test.post', :'post', false);
select set_config('test.ghost', :'ghost', false);

commit;

-- ---------------------------------- 1. control: an anonymous view counts ----
--
-- If this fails nothing else here means anything: every check below is about
-- a view NOT counting, and a function that never counts would pass them all.

begin;
set local role anon;
-- What PostgREST sends for an anonymous request. Without it the stub's
-- `current_setting(...)::jsonb` cast meets an empty string left behind by an
-- earlier `set local`, which is a parse error rather than "no session".
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_before integer;
  v_after integer;
begin
  select views_count into v_before from public.posts where id = current_setting('test.post')::uuid;

  perform public.increment_post_views(current_setting('test.post')::uuid, 'viewer-one');

  select views_count into v_after from public.posts where id = current_setting('test.post')::uuid;

  if v_after <> v_before + 1 then
    raise exception 'CONTROL FAILED: an ordinary anonymous view did not count (% -> %)', v_before, v_after;
  end if;

  raise notice 'CONTROL PASSED: an anonymous view still counts';
end $$;

commit;

-- ------------------------- 2/3. the same viewer, again and again and again --
--
-- Called directly as anon, exactly as PostgREST would relay it. The first call
-- above already counted this post for a different viewer key; these fifty are
-- one viewer, and must produce exactly one more.

begin;
set local role anon;
-- What PostgREST sends for an anonymous request. Without it the stub's
-- `current_setting(...)::jsonb` cast meets an empty string left behind by an
-- earlier `set local`, which is a parse error rather than "no session".
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_before integer;
  v_after integer;
begin
  select views_count into v_before from public.posts where id = current_setting('test.post')::uuid;

  for i in 1..50 loop
    perform public.increment_post_views(current_setting('test.post')::uuid, 'viewer-two');
  end loop;

  select views_count into v_after from public.posts where id = current_setting('test.post')::uuid;

  if v_after <> v_before + 1 then
    raise exception 'EXPLOIT SUCCEEDED: 50 calls from one viewer moved the counter by % (expected 1)', v_after - v_before;
  end if;

  raise notice 'BLOCKED: fifty calls from one viewer count once';
end $$;

commit;

-- --------------- the attacker who varies the key meets the per-post ceiling --
--
-- De-duplication keys on what the caller sends, so a caller who sends a fresh
-- value every time defeats layer 1 by design. Layer 2 is what stops them: the
-- post's counter may move 300 times an hour however many distinct viewers
-- claim to exist. 400 calls, each with its own key.

begin;
set local role anon;
-- What PostgREST sends for an anonymous request. Without it the stub's
-- `current_setting(...)::jsonb` cast meets an empty string left behind by an
-- earlier `set local`, which is a parse error rather than "no session".
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_before integer;
  v_after integer;
  v_gain integer;
begin
  select views_count into v_before from public.posts where id = current_setting('test.post')::uuid;

  for i in 1..400 loop
    perform public.increment_post_views(current_setting('test.post')::uuid, 'attacker-' || i::text);
  end loop;

  select views_count into v_after from public.posts where id = current_setting('test.post')::uuid;
  v_gain := v_after - v_before;

  if v_gain >= 400 then
    raise exception 'EXPLOIT SUCCEEDED: 400 forged viewers added % views — the ceiling is not enforced', v_gain;
  end if;

  if v_gain > 300 then
    raise exception 'EXPLOIT SUCCEEDED: the per-post ceiling let through % views', v_gain;
  end if;

  raise notice 'BLOCKED: 400 forged viewers added only % views, against a ceiling of 300', v_gain;
end $$;

commit;

-- ------------------- 4. a post that does not exist is not created or counted --

begin;
set local role anon;
-- What PostgREST sends for an anonymous request. Without it the stub's
-- `current_setting(...)::jsonb` cast meets an empty string left behind by an
-- earlier `set local`, which is a parse error rather than "no session".
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform public.increment_post_views(current_setting('test.ghost')::uuid, 'viewer-three');

  if exists (select 1 from public.posts where id = current_setting('test.ghost')::uuid) then
    raise exception 'EXPLOIT SUCCEEDED: a post was created by viewing it';
  end if;

  raise notice 'BLOCKED: viewing a post that does not exist creates nothing';
end $$;

commit;

-- Nor does it leave a mark behind, which would otherwise be an unbounded table
-- an anonymous caller could grow one row at a time.
do $$
begin
  if exists (
    select 1 from public.post_view_marks where post_id = current_setting('test.ghost')::uuid
  ) then
    raise exception 'EXPLOIT SUCCEEDED: a nonexistent post accumulated view marks';
  end if;

  raise notice 'BLOCKED: no bookkeeping is kept for a post that does not exist';
end $$;

-- ------------------------- 5. no column but the counter can be reached ------
--
-- The function is security definer, so what it is *able* to write matters more
-- than what the policies allow the caller. Everything except views_count must
-- come back unchanged after all the calls above.

do $$
declare
  v_title text;
  v_desc text;
  v_category text;
  v_user uuid;
begin
  select title, description, category, user_id
  into v_title, v_desc, v_category, v_user
  from public.posts where id = current_setting('test.post')::uuid;

  if v_title <> 'A post to look at' or v_desc <> '' or v_category <> 'movie' then
    raise exception 'EXPLOIT SUCCEEDED: increment_post_views changed a column other than views_count';
  end if;

  if v_user <> 'aa555555-5555-4555-8555-555555555501'::uuid then
    raise exception 'EXPLOIT SUCCEEDED: the post changed hands';
  end if;

  raise notice 'CONFIRMED: only views_count moved';
end $$;

-- ----------------------------- 6. a signed-in viewer is throttled the same ---
--
-- And cannot escape by varying the key: for an authenticated caller the viewer
-- is auth.uid(), which no argument overrides.

begin;
delete from public.post_view_marks;
delete from public.rate_limits;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa555555-5555-4555-8555-555555555502","role":"authenticated"}';

do $$
declare
  v_before integer;
  v_after integer;
begin
  select views_count into v_before from public.posts where id = current_setting('test.post')::uuid;

  -- Twenty calls, each claiming to be a different anonymous viewer. The claim
  -- is ignored because this session has an account.
  for i in 1..20 loop
    perform public.increment_post_views(current_setting('test.post')::uuid, 'disguise-' || i::text);
  end loop;

  select views_count into v_after from public.posts where id = current_setting('test.post')::uuid;

  if v_after <> v_before + 1 then
    raise exception 'EXPLOIT SUCCEEDED: a signed-in viewer forged % views by varying the key', v_after - v_before;
  end if;

  raise notice 'BLOCKED: a signed-in viewer counts once however many keys they claim';
end $$;

commit;

-- ------------------- 8. the posts UPDATE policy still refuses tampering ------
--
-- Migration 009's clause, restated here because 018 touched the same counter.
-- The author of a post must not be able to write views_count directly.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa555555-5555-4555-8555-555555555501","role":"authenticated"}';

do $$
begin
  begin
    update public.posts
    set views_count = 999999
    where id = current_setting('test.post')::uuid;
  exception
    when others then
      raise notice 'BLOCKED: the author cannot write views_count (%)', sqlerrm;
      return;
  end;

  -- A refusal by policy is silent — the row simply does not match — so the
  -- value is what says whether it held.
  if exists (
    select 1 from public.posts
    where id = current_setting('test.post')::uuid and views_count = 999999
  ) then
    raise exception 'EXPLOIT SUCCEEDED: the author set their own view count';
  end if;

  raise notice 'BLOCKED: the author cannot write views_count';
end $$;

rollback;

-- ------------------------------------------------------------- the ledger ---
--
-- Reachable only through the function: RLS on, no policies, exactly as
-- upload_grants and rate_limits are.

do $$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'post_view_marks'
  ) then
    raise exception 'REGRESSION: post_view_marks has a policy and is reachable from the API';
  end if;

  if not (
    select relrowsecurity from pg_class where oid = 'public.post_view_marks'::regclass
  ) then
    raise exception 'REGRESSION: post_view_marks does not have row level security enabled';
  end if;

  raise notice 'CONFIRMED: the view ledger is reachable only through the function';
end $$;
