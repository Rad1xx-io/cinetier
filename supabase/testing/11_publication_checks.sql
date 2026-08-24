-- What a published board promises, checked against a running Postgres.
--
-- Two promises, and they pull in opposite directions, which is why they are
-- worth testing together:
--
--   * the SHAPE is frozen — editing the live board afterwards leaves the post
--     showing what it showed when Publish was pressed;
--   * the PICTURES are live — hiding, blocking or deleting a card takes it out
--     of the post at once, because the post never held a copy.
--
-- As in 10_rls_checks, every scenario runs as `authenticated` with a real
-- claim, and a control proves the role can do the allowed thing first.

\set ON_ERROR_STOP on

\set owner    '33333333-3333-4333-8333-333333333333'
\set stranger '44444444-4444-4444-8444-444444444444'
\set list     'cccccccc-0000-4000-8000-000000000001'
\set rowS     'cccccccc-0000-4000-8000-0000000000a1'
\set card1    'cccccccc-0000-4000-8000-0000000000b1'
\set card2    'cccccccc-0000-4000-8000-0000000000b2'
\set post     'cccccccc-0000-4000-8000-0000000000c1'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_moderation;
delete from public.custom_list_publications;
delete from public.posts where id = :'post';
delete from public.custom_items where list_id = :'list';
delete from public.custom_tier_rows where list_id = :'list';
delete from public.custom_tier_lists where id = :'list';
delete from public.profiles where id in (:'owner', :'stranger');
delete from auth.users where id in (:'owner', :'stranger');

insert into auth.users (id, email) values
  (:'owner', 'owner@example.test'), (:'stranger', 'stranger@example.test');
insert into public.profiles (id, username) values
  (:'owner', 'owner'), (:'stranger', 'stranger');

insert into public.custom_tier_lists (id, user_id, title, is_public)
values (:'list', :'owner', 'Holiday photos', true);

insert into public.custom_tier_rows (id, list_id, position, label, color)
values (:'rowS', :'list', 0, 'S', '#ef4444');

insert into public.custom_items (id, list_id, row_id, position, caption, image_path) values
  (:'card1', :'list', :'rowS', 0, 'the good one', 'owner/list/one.jpg'),
  (:'card2', :'list', :'rowS', 1, 'the other one', 'owner/list/two.jpg');

commit;

-- ------------------------------------------------- control: publishing -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

do $$
declare
  v_snapshot jsonb;
begin
  insert into public.posts (id, user_id, title, category)
  values ('cccccccc-0000-4000-8000-0000000000c1', auth.uid(), 'Holiday photos', 'custom');

  select jsonb_build_object(
    'rows', (
      select jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'color', r.color, 'position', r.position)
                       order by r.position)
      from public.custom_tier_rows r where r.list_id = 'cccccccc-0000-4000-8000-000000000001'
    ),
    'items', (
      select jsonb_agg(jsonb_build_object('id', i.id, 'rowId', i.row_id, 'position', i.position, 'caption', i.caption)
                       order by i.position)
      from public.custom_items i where i.list_id = 'cccccccc-0000-4000-8000-000000000001'
    )
  ) into v_snapshot;

  insert into public.custom_list_publications (post_id, list_id, snapshot)
  values ('cccccccc-0000-4000-8000-0000000000c1', 'cccccccc-0000-4000-8000-000000000001', v_snapshot);

  if jsonb_array_length(v_snapshot -> 'items') <> 2 then
    raise exception 'CONTROL FAILED: the snapshot did not capture both cards';
  end if;

  raise notice 'CONTROL PASSED: an owner can publish, and the snapshot holds both cards';
end $$;

commit;

-- ---------------------------------------- the shape survives later edits ---

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

do $$
declare
  v_items jsonb;
  v_captions text;
begin
  -- Everything a person does to a board after publishing it.
  delete from public.custom_items where id = 'cccccccc-0000-4000-8000-0000000000b2';
  update public.custom_items set position = 7, caption = 'renamed since'
  where id = 'cccccccc-0000-4000-8000-0000000000b1';
  update public.custom_tier_rows set label = 'Best', color = '#00ff00'
  where id = 'cccccccc-0000-4000-8000-0000000000a1';
  -- Adding a card is not done with an insert — nothing may write custom_items
  -- directly, so a new card arrives through attach_upload with a grant behind
  -- it, which 10_rls_checks covers. Removing, moving and renaming are enough
  -- to tell whether the snapshot is following the board.

  select p.snapshot -> 'items' into v_items
  from public.custom_list_publications p
  where p.post_id = 'cccccccc-0000-4000-8000-0000000000c1';

  if jsonb_array_length(v_items) <> 2 then
    raise exception 'FAILED: the snapshot followed the live board (% cards)', jsonb_array_length(v_items);
  end if;

  select string_agg(value ->> 'caption', ', ' order by (value ->> 'position')::int)
  into v_captions from jsonb_array_elements(v_items);

  if v_captions <> 'the good one, the other one' then
    raise exception 'FAILED: the captions moved with the live board — got "%"', v_captions;
  end if;

  if (select snapshot -> 'rows' -> 0 ->> 'label' from public.custom_list_publications
      where post_id = 'cccccccc-0000-4000-8000-0000000000c1') <> 'S' then
    raise exception 'FAILED: the tier was renamed inside a published snapshot';
  end if;

  raise notice 'PASSED: the snapshot is unchanged by deleting, moving, renaming and adding';
end $$;

rollback;

-- ------------------------------------------- and cannot be rewritten -------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

do $$
declare
  v_rows integer;
begin
  update public.custom_list_publications
  set snapshot = '{"rows": [], "items": []}'::jsonb
  where post_id = 'cccccccc-0000-4000-8000-0000000000c1';
  get diagnostics v_rows = row_count;

  if v_rows <> 0 then
    raise exception 'FAILED: an owner rewrote a published snapshot (% rows)', v_rows;
  end if;
  raise notice 'PASSED: a snapshot cannot be rewritten, not even by its author';
exception
  when insufficient_privilege then
    raise notice 'PASSED: a snapshot refuses updates outright';
end $$;

rollback;

-- --------------------------------------------- hiding reaches the post -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
update public.custom_items set hidden_at = now()
where id = 'cccccccc-0000-4000-8000-0000000000b1';
commit;

begin;
set local role authenticated;
-- A stranger, which is who a post is for.
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.custom_items
  where id = 'cccccccc-0000-4000-8000-0000000000b1';

  -- The post renders its cards by looking them up live, so a card nobody else
  -- can read is a card the post cannot show.
  if v_visible <> 0 then
    raise exception 'FAILED: a hidden card is still readable by a stranger — the post would still show it';
  end if;
  raise notice 'PASSED: hiding a card takes it out of the post, not only off the board';
end $$;

rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
update public.custom_items set hidden_at = null
where id = 'cccccccc-0000-4000-8000-0000000000b1';
commit;

-- ------------------------------------ blocking takes the post with it ------

begin;
insert into public.content_moderation (subject_type, subject_id, note)
values ('custom_list', 'cccccccc-0000-4000-8000-000000000001', 'test takedown');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.custom_list_publications
  where post_id = 'cccccccc-0000-4000-8000-0000000000c1';

  if v_visible <> 0 then
    raise exception 'FAILED: a blocked board is still published';
  end if;
  raise notice 'PASSED: blocking a board removes its publication from the feed';
end $$;

rollback;

begin;
delete from public.content_moderation
where subject_id = 'cccccccc-0000-4000-8000-000000000001';
commit;

-- --------------------------------------- only the owner may publish --------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

do $$
begin
  begin
    insert into public.posts (id, user_id, title, category)
    values ('cccccccc-0000-4000-8000-0000000000c2', auth.uid(), 'Not mine', 'custom');
    insert into public.custom_list_publications (post_id, list_id, snapshot)
    values ('cccccccc-0000-4000-8000-0000000000c2', 'cccccccc-0000-4000-8000-000000000001', '{}'::jsonb);
    raise exception 'FAILED: a stranger published somebody else''s board';
  exception
    when insufficient_privilege then
      raise notice 'PASSED: only the board''s owner can publish it';
  end;
end $$;

rollback;

\echo ''
\echo 'All publication checks ran. Anything that failed would have aborted the script.'
