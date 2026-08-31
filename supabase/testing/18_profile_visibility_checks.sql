-- What migration 021 claims: the profile privacy switch covers the profile.
--
-- The finding: `Profiles are publicly readable` was `using (true)`. That is
-- what /u/<username> needs — a stranger with no session has to be able to
-- resolve a handle — and it is also what `select=*` needs to hand back every
-- account on the site. `is_public` gated the rankings and never gated the row.
--
-- The interesting half of this file is not the refusal. It is the three things
-- that must keep working, because the obvious fix — refuse anything not
-- public — quietly breaks the feed: `post_feed` joins profiles with
-- `security_invoker`, so a profile a reader cannot see is a post that
-- disappears, and a private account is allowed to post.

\set ON_ERROR_STOP on

\set public_user  'aa000000-1111-4111-8111-000000000001'
\set private_user 'aa000000-1111-4111-8111-000000000002'
\set private_poster 'aa000000-1111-4111-8111-000000000003'
\set stranger 'aa000000-1111-4111-8111-000000000004'
\set post_id 'ab000000-0000-4000-8000-000000000001'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.posts where id = :'post_id';
delete from public.profiles where id in (:'public_user', :'private_user', :'private_poster', :'stranger');
delete from auth.users where id in (:'public_user', :'private_user', :'private_poster', :'stranger');

insert into auth.users (id, email) values
  (:'public_user', 'vis-public@example.test'),
  (:'private_user', 'vis-private@example.test'),
  (:'private_poster', 'vis-privposter@example.test'),
  (:'stranger', 'vis-stranger@example.test');

insert into public.profiles (id, username, display_name, is_public) values
  (:'public_user', 'vis_public', 'Public Person', true),
  -- Private and silent: the account this migration is actually about.
  (:'private_user', 'vis_private', 'Private Person', false),
  -- Private but participating: their handle is already on a post in the feed.
  (:'private_poster', 'vis_privposter', 'Private Poster', false),
  (:'stranger', 'vis_stranger', 'Stranger', true);

insert into public.posts (id, user_id, title, description, category)
values (:'post_id', :'private_poster', 'A post from a private account', '', 'movie');

select set_config('test.public_user', :'public_user', false);
select set_config('test.private_user', :'private_user', false);
select set_config('test.private_poster', :'private_poster', false);
select set_config('test.post_id', :'post_id', false);

commit;

-- ------------------------------------------- 1/5. anonymous, public profile --

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_username text;
  v_display text;
begin
  select username, display_name into v_username, v_display
  from public.profiles where id = current_setting('test.public_user')::uuid;

  if v_username is null then
    raise exception 'CONTROL FAILED: a public profile is not readable anonymously — /u/<username> is broken';
  end if;

  if v_username <> 'vis_public' or v_display <> 'Public Person' then
    raise exception 'CONTROL FAILED: the public fields /u/<username> renders did not come back';
  end if;

  raise notice 'CONTROL PASSED: a public profile is readable anonymously, with the fields the page needs';
end $$;

commit;

-- ---------------------------------- 2/6. anonymous, private and not posting --

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.profiles where id = current_setting('test.private_user')::uuid;

  if v_count <> 0 then
    raise exception 'EXPLOIT SUCCEEDED: a private, non-posting profile is readable anonymously';
  end if;

  -- The shape of the original finding: not a lookup, a listing.
  if exists (
    select 1 from public.profiles where username = 'vis_private'
  ) then
    raise exception 'EXPLOIT SUCCEEDED: a private profile can be found by username';
  end if;

  raise notice 'BLOCKED: a private, non-posting profile cannot be read or enumerated';
end $$;

commit;

-- --------------------------- 4. the feed must still work for a private poster --
--
-- The regression the obvious fix causes. `post_feed` joins profiles under the
-- reader's own RLS, so if this row is unreadable the post vanishes — and
-- posting is something a private account is allowed to do.

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_username text;
  v_is_public boolean;
begin
  if not exists (
    select 1 from public.profiles where id = current_setting('test.private_poster')::uuid
  ) then
    raise exception 'REGRESSION: a private account that has posted is unreadable — its post would drop out of the feed';
  end if;

  select username, is_public into v_username, v_is_public
  from public.post_feed where id = current_setting('test.post_id')::uuid;

  if v_username is null then
    raise exception 'REGRESSION: the post of a private account has vanished from the feed';
  end if;

  if v_username <> 'vis_privposter' then
    raise exception 'REGRESSION: the feed lost the byline of a private account''s post';
  end if;

  -- And the flag the card uses to decide whether to offer Fork still arrives.
  if v_is_public is not false then
    raise exception 'REGRESSION: the feed no longer reports that this author is private';
  end if;

  raise notice 'PASSED: a private account''s post keeps its byline and its is_public flag in the feed';
end $$;

commit;

-- ------------------------------------------- 3. a signed-in stranger, and self --

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-1111-4111-8111-000000000004","role":"authenticated"}';

do $$
begin
  -- Being signed in is not a way in. A stranger sees exactly what anon sees.
  if exists (
    select 1 from public.profiles where id = current_setting('test.private_user')::uuid
  ) then
    raise exception 'EXPLOIT SUCCEEDED: any signed-in account can read a private profile';
  end if;

  if not exists (
    select 1 from public.profiles where id = current_setting('test.public_user')::uuid
  ) then
    raise exception 'REGRESSION: a signed-in visitor cannot read a public profile';
  end if;

  raise notice 'BLOCKED: signing in does not reveal a private profile';
end $$;

commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aa000000-1111-4111-8111-000000000002","role":"authenticated"}';

do $$
begin
  -- The owner must always see their own, or Settings cannot render.
  if not exists (
    select 1 from public.profiles where id = current_setting('test.private_user')::uuid
  ) then
    raise exception 'REGRESSION: a private account cannot read its own profile — Settings would break';
  end if;

  raise notice 'PASSED: a private account still reads its own profile';
end $$;

commit;

-- --------------------------------- the policies that read profiles still work --
--
-- 004's published-tier-list rule and 005's criteria rule both ask whether the
-- author's profile is public. They ask it through this policy, so narrowing it
-- could have made every published board invisible.

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  insert into public.ranked_titles (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
  values (current_setting('test.public_user')::uuid, 991, 'movie', 'Visible', 'S', 0, 0, 0);
  raise exception 'CONTROL FAILED: anon could write a ranked title';
exception
  when insufficient_privilege or others then
    null;
end $$;

commit;

begin;
insert into public.ranked_titles (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values (current_setting('test.public_user')::uuid, 991, 'movie', 'Visible', 'S', 0, 0, 0)
on conflict do nothing;
commit;

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  if not exists (
    select 1 from public.ranked_titles
    where user_id = current_setting('test.public_user')::uuid and tmdb_id = 991
  ) then
    raise exception 'REGRESSION: a public account''s published board is no longer readable';
  end if;

  raise notice 'PASSED: a public board is still published, so the policies that read profiles still resolve';
end $$;

commit;

-- ---------------------------------------------------------- the policy text --

do $$
declare
  v_qual text;
begin
  select qual into v_qual from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'Profiles are publicly readable';

  if v_qual = 'true' then
    raise exception 'REGRESSION: the profiles policy is unconditional again';
  end if;

  raise notice 'CONFIRMED: the profiles policy is conditional';
end $$;
