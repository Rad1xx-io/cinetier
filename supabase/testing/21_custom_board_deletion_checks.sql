-- What migration 024 claims, checked against a running Postgres.
--
-- The database has allowed an owner to delete their own custom_tier_lists row
-- since migration 012. What this checks is the function built on top of that:
-- that deleting an unpublished board takes its tiers and cards with it and
-- reports no post removed; that deleting a published board takes the post
-- with it too, rather than leaving one in the feed with nothing behind it;
-- that another account cannot reach somebody else's board through this RPC
-- even though the RPC itself bypasses RLS internally; and that a board under
-- a moderation block cannot be deleted by its own owner, matching the
-- existing RLS delete policy exactly.
--
-- Ids are carried as session settings rather than psql variables past the
-- fixtures section: a `:'var'` is substituted before the server sees the
-- statement, which works in plain DDL but not inside the plpgsql bodies
-- below, where the value has to be read at runtime — the same convention
-- 13_image_path_checks.sql uses for the same reason.

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'

\set alice_list_draft     'cccccccc-1000-4000-8000-00000000a001'
\set alice_row_draft      'cccccccc-1000-4000-8000-00000000a002'
\set alice_list_published 'cccccccc-1000-4000-8000-00000000a003'
\set alice_list_blocked   'cccccccc-1000-4000-8000-00000000a004'
\set alice_post           'cccccccc-1000-4000-8000-00000000a005'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_moderation where subject_type = 'custom_list';
delete from public.custom_list_publications
  where list_id in (:'alice_list_draft', :'alice_list_published', :'alice_list_blocked');
delete from public.posts where id = :'alice_post';
delete from public.custom_items where list_id in (:'alice_list_draft', :'alice_list_published', :'alice_list_blocked');
delete from public.custom_tier_rows where list_id in (:'alice_list_draft', :'alice_list_published', :'alice_list_blocked');
delete from public.custom_tier_lists where id in (:'alice_list_draft', :'alice_list_published', :'alice_list_blocked');
delete from public.profiles where id in (:'alice', :'bob');
delete from auth.users where id in (:'alice', :'bob');

insert into auth.users (id, email) values
  (:'alice', 'alice-delboard@example.test'),
  (:'bob', 'bob-delboard@example.test');
-- posts.user_id references profiles, not auth.users directly.
insert into public.profiles (id, username) values
  (:'alice', 'alice-delboard'), (:'bob', 'bob-delboard');

insert into public.custom_tier_lists (id, user_id, title) values
  (:'alice_list_draft', :'alice', 'Never published'),
  (:'alice_list_published', :'alice', 'Published, about to go'),
  (:'alice_list_blocked', :'alice', 'Under review');

insert into public.custom_tier_rows (id, list_id, position, label, color) values
  (:'alice_row_draft', :'alice_list_draft', 0, 'S', '#ef4444');

insert into public.posts (id, user_id, title, description, category) values
  (:'alice_post', :'alice', 'A board about to go', '', 'custom');
insert into public.custom_list_publications (post_id, list_id, snapshot) values
  (:'alice_post', :'alice_list_published', '{"rows":[],"items":[]}'::jsonb);

insert into public.content_moderation (subject_type, subject_id, note)
values ('custom_list', :'alice_list_blocked', 'test takedown');

select set_config('test.list_draft', :'alice_list_draft', false);
select set_config('test.row_draft', :'alice_row_draft', false);
select set_config('test.list_published', :'alice_list_published', false);
select set_config('test.list_blocked', :'alice_list_blocked', false);
select set_config('test.post', :'alice_post', false);

commit;

-- ------------------------------------ 1. deleting an unpublished board -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_removed_post boolean;
begin
  v_removed_post := public.delete_custom_board(current_setting('test.list_draft')::uuid);

  if v_removed_post is distinct from false then
    raise exception 'REGRESSION: deleting an unpublished board reported removing a post';
  end if;

  if exists (select 1 from public.custom_tier_lists where id = current_setting('test.list_draft')::uuid) then
    raise exception 'REGRESSION: the board survived its own deletion';
  end if;

  if exists (select 1 from public.custom_tier_rows where id = current_setting('test.row_draft')::uuid) then
    raise exception 'REGRESSION: a tier row survived its board being deleted';
  end if;

  raise notice 'CONFIRMED: deleting an unpublished board removes it and its tiers, and reports no post removed';
end $$;

commit;

-- -------------------------------------- 2. deleting a published board ------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_removed_post boolean;
begin
  v_removed_post := public.delete_custom_board(current_setting('test.list_published')::uuid);

  if v_removed_post is distinct from true then
    raise exception 'REGRESSION: deleting a published board did not report removing a post';
  end if;

  if exists (select 1 from public.posts where id = current_setting('test.post')::uuid) then
    raise exception 'REGRESSION: the post survived its own board being deleted — this is the hole the migration closes';
  end if;

  if exists (select 1 from public.custom_list_publications where list_id = current_setting('test.list_published')::uuid) then
    raise exception 'REGRESSION: the publication row survived';
  end if;

  if exists (select 1 from public.custom_tier_lists where id = current_setting('test.list_published')::uuid) then
    raise exception 'REGRESSION: the published board survived its own deletion';
  end if;

  raise notice 'CONFIRMED: deleting a published board takes its post with it, not just the board';
end $$;

commit;

-- ------------------------------- 3. another account cannot reach it --------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
begin
  begin
    perform public.delete_custom_board(current_setting('test.list_blocked')::uuid);
    raise exception 'EXPLOIT SUCCEEDED: a different account deleted somebody else''s board';
  exception
    when others then
      if sqlerrm not like '%does not exist, or is not yours%' then
        raise;
      end if;
  end;

  raise notice 'BLOCKED: a board cannot be deleted by anyone but its owner';
end $$;

commit;

do $$
begin
  if not exists (select 1 from public.custom_tier_lists where id = current_setting('test.list_blocked')::uuid) then
    raise exception 'REGRESSION: the board is gone despite the wrong owner being refused';
  end if;
end $$;

-- -------------------------------- 4. a blocked board cannot be deleted -----
--
-- By its own owner, either. A block its subject can delete their way out of
-- is not a block — it would let an owner destroy the evidence a report is
-- about, and the existing RLS delete policy on custom_tier_lists already
-- refuses this; this function has to agree with it rather than reopen it.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
begin
  begin
    perform public.delete_custom_board(current_setting('test.list_blocked')::uuid);
    raise exception 'EXPLOIT SUCCEEDED: the owner deleted a board under a moderation block';
  exception
    when others then
      if sqlerrm not like '%under review%' then
        raise;
      end if;
  end;

  raise notice 'BLOCKED: a board under a moderation block cannot be deleted by its own owner';
end $$;

commit;

do $$
begin
  if not exists (select 1 from public.custom_tier_lists where id = current_setting('test.list_blocked')::uuid) then
    raise exception 'REGRESSION: the blocked board is gone despite the block';
  end if;
end $$;

-- ------------------------------------------------------------- cleanup -----

begin;
delete from public.content_moderation where subject_type = 'custom_list' and subject_id = :'alice_list_blocked'::uuid;
delete from public.custom_tier_lists where id = :'alice_list_blocked'::uuid;
delete from public.profiles where id in (:'alice', :'bob');
delete from auth.users where id in (:'alice', :'bob');
commit;

-- ------------------------------------------------------------- privileges --

do $$
declare
  v_leaky text;
begin
  select string_agg(p.proname, ', ') into v_leaky
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_custom_board'
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_leaky is not null then
    raise exception 'REGRESSION: anon can execute delete_custom_board';
  end if;

  raise notice 'CONFIRMED: delete_custom_board is callable only by authenticated';
end $$;
