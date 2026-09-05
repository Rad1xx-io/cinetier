-- What a published board promises AFTER migration 029, checked against a
-- running Postgres.
--
-- 013 promised the opposite of this and said so in its own header: the shape
-- was frozen and the pictures were live, so that a takedown reached a post
-- that had already been published. The product decision changed — a post
-- behaves like a post, and editing your board afterwards does not edit what
-- other people already read — but the takedown requirement did not.
--
-- So the two promises still pull against each other, and that tension is the
-- whole point of this file:
--
--   * the PICTURE is frozen — removing a card from the live board leaves the
--     published post showing it, unchanged;
--   * moderation still reaches it — a block on the card, or on its board,
--     takes the picture out of the published post at once, even though the
--     card is no longer on any board at all.
--
-- The second is the one worth being nervous about, and it is checked for a
-- card that has already been detached, which is the state that did not exist
-- before 029 and is where a moderation hole would live if there were one.

\set ON_ERROR_STOP on

\set owner  '77777777-7777-4777-8777-777777777777'
\set list   'dddddddd-0000-4000-8000-000000000001'
\set rowS   'dddddddd-0000-4000-8000-0000000000a1'
\set kept   'dddddddd-0000-4000-8000-0000000000b1'
\set pulled 'dddddddd-0000-4000-8000-0000000000b2'
\set spare  'dddddddd-0000-4000-8000-0000000000b3'
\set post   'dddddddd-0000-4000-8000-0000000000c1'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_moderation;
delete from public.custom_list_publications;
delete from public.posts where id = :'post';
delete from public.custom_items where list_id = :'list';
delete from public.custom_tier_rows where list_id = :'list';
delete from public.custom_tier_lists where id = :'list';
delete from public.profiles where id = :'owner';
delete from auth.users where id = :'owner';

insert into auth.users (id, email) values (:'owner', 'frozen-owner@example.test');
insert into public.profiles (id, username, is_public) values (:'owner', 'frozenowner', true);

insert into public.custom_tier_lists (id, user_id, title, is_public)
values (:'list', :'owner', 'Frozen board', true);

insert into public.custom_tier_rows (id, list_id, position, label, color, image_path)
values (:'rowS', :'list', 0, 'S', '#ef4444', 'owner/list/tier.jpg');

insert into public.custom_items (id, list_id, row_id, position, caption, image_path) values
  (:'kept',   :'list', :'rowS', 0, 'stays on the board', 'owner/list/kept.jpg'),
  (:'pulled', :'list', :'rowS', 1, 'pulled off later',   'owner/list/pulled.jpg'),
  (:'spare',  :'list', :'rowS', 2, 'never published',    'owner/list/spare.jpg');

insert into public.posts (id, user_id, title, category)
values (:'post', :'owner', 'Frozen board', 'custom');

-- Published with the first two cards only, so `spare` is a card no
-- publication names — the case that must still be deleted outright.
insert into public.custom_list_publications (post_id, list_id, snapshot)
values (
  :'post', :'list',
  jsonb_build_object(
    'rows', jsonb_build_array(jsonb_build_object('id', :'rowS', 'label', 'S', 'color', '#ef4444', 'position', 0)),
    'items', jsonb_build_array(
      jsonb_build_object('id', :'kept',   'rowId', :'rowS', 'position', 0, 'caption', 'stays on the board'),
      jsonb_build_object('id', :'pulled', 'rowId', :'rowS', 'position', 1, 'caption', 'pulled off later')
    )
  )
);

commit;

-- --------------------------------------- control: the post renders both ----

begin;
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.custom_items
  where id in ('dddddddd-0000-4000-8000-0000000000b1', 'dddddddd-0000-4000-8000-0000000000b2');

  if v_visible <> 2 then
    raise exception 'CONTROL FAILED: a reader sees % of the published cards, not 2', v_visible;
  end if;
  raise notice 'CONTROL PASSED: both published cards are readable, with their pictures, before anything is removed';
end $$;

rollback;

-- ------------------------------------ the direction Denis actually asked ---

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}';

do $$
declare
  v_outcome text;
begin
  v_outcome := public.remove_custom_item('dddddddd-0000-4000-8000-0000000000b2');
  if v_outcome <> 'detached' then
    raise exception 'FAILED: a published card reported "%", not detached', v_outcome;
  end if;

  -- The unpublished one has nothing holding it, so it goes for real.
  v_outcome := public.remove_custom_item('dddddddd-0000-4000-8000-0000000000b3');
  if v_outcome <> 'deleted' then
    raise exception 'FAILED: an unpublished card reported "%", not deleted', v_outcome;
  end if;

  raise notice 'PASSED: removing a card detaches it when a post names it, and deletes it when none does';
end $$;

commit;

begin;
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare
  v_path text;
begin
  select image_path into v_path from public.custom_items
  where id = 'dddddddd-0000-4000-8000-0000000000b2';

  if v_path is distinct from 'owner/list/pulled.jpg' then
    raise exception 'FAILED: the published post lost its picture when the card left the board (got %)', coalesce(v_path, 'nothing');
  end if;
  raise notice 'PASSED: the already-published post still resolves the picture it was published with';
end $$;

rollback;

-- ---------------------------------- the direction nobody asked about -------

-- A block on the DETACHED card: the state that did not exist before 029, and
-- the one a moderation hole would hide in.
begin;
insert into public.content_moderation (subject_type, subject_id)
values ('custom_item', 'dddddddd-0000-4000-8000-0000000000b2');
commit;

begin;
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.custom_items
  where id = 'dddddddd-0000-4000-8000-0000000000b2';

  if v_visible <> 0 then
    raise exception 'BLOCK FAILED: a blocked card is still readable after being detached — the freeze outlived the takedown';
  end if;
  raise notice 'BLOCKED: a blocked card disappears from the published post even though it is no longer on any board';
end $$;

rollback;

-- The card that is still on the board, blocked the same way.
begin;
insert into public.content_moderation (subject_type, subject_id)
values ('custom_item', 'dddddddd-0000-4000-8000-0000000000b1');
commit;

begin;
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.custom_items
  where id = 'dddddddd-0000-4000-8000-0000000000b1';
  if v_visible <> 0 then
    raise exception 'BLOCK FAILED: a blocked card still on the board is readable';
  end if;
  raise notice 'BLOCKED: a blocked card on the live board disappears too, unchanged from before';
end $$;

rollback;

begin;
delete from public.content_moderation where subject_type = 'custom_item';
commit;

-- A blocked TIER ROW. Published posts carry no tier picture — PublishedBoard
-- has no image on its rows — so what is checked is the live board, which is
-- the only place a tier picture is ever shown.
begin;
insert into public.content_moderation (subject_type, subject_id)
values ('custom_tier_row', 'dddddddd-0000-4000-8000-0000000000a1');
commit;

begin;
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.custom_tier_rows
  where id = 'dddddddd-0000-4000-8000-0000000000a1';
  if v_visible <> 0 then
    raise exception 'BLOCK FAILED: a blocked tier row is still readable';
  end if;
  raise notice 'BLOCKED: a blocked tier row disappears, and no published post ever showed its picture';
end $$;

rollback;

begin;
delete from public.content_moderation where subject_type = 'custom_tier_row';
commit;

-- The whole list.
begin;
insert into public.content_moderation (subject_type, subject_id)
values ('custom_list', 'dddddddd-0000-4000-8000-000000000001');
commit;

begin;
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare
  v_pubs integer;
begin
  select count(*) into v_pubs from public.custom_list_publications
  where post_id = 'dddddddd-0000-4000-8000-0000000000c1';
  if v_pubs <> 0 then
    raise exception 'BLOCK FAILED: a blocked board still publishes a readable snapshot';
  end if;
  raise notice 'BLOCKED: blocking the board takes the whole published snapshot with it';
end $$;

rollback;

-- An owner cannot answer a report by emptying the board under review.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}';

do $$
begin
  perform public.remove_custom_item('dddddddd-0000-4000-8000-0000000000b1');
  raise exception 'BLOCK FAILED: a card was removed from a board under review';
exception
  when insufficient_privilege then
    raise notice 'BLOCKED: a board under review cannot have its cards removed, not even by its owner';
end $$;

rollback;

begin;
delete from public.content_moderation;
commit;

-- --------------------------------------------- the door that was closed ----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}';

do $$
begin
  delete from public.custom_items where id = 'dddddddd-0000-4000-8000-0000000000b1';
  raise exception 'FAILED: a client deleted a card directly, so the freeze can be stepped around';
exception
  when insufficient_privilege then
    raise notice 'BLOCKED: a client cannot delete cards directly — removal only runs through the database function';
end $$;

rollback;

-- ------------------------------------------------ clearing a whole board ---

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777777","role":"authenticated"}';

do $$
declare
  v_deleted integer;
  v_detached integer;
begin
  v_deleted := public.clear_custom_board('dddddddd-0000-4000-8000-000000000001');

  select count(*) into v_detached from public.custom_items
  where list_id = 'dddddddd-0000-4000-8000-000000000001' and detached_at is not null;

  -- `kept` was published and survives detached; `pulled` was already detached;
  -- `spare` was deleted outright earlier, so there is nothing left to delete.
  if v_detached <> 2 then
    raise exception 'FAILED: clearing left % detached cards, expected 2', v_detached;
  end if;
  if v_deleted <> 0 then
    raise exception 'FAILED: clearing deleted % published cards', v_deleted;
  end if;

  raise notice 'CONFIRMED: clearing a board keeps every card a post still shows, and deletes the rest';
end $$;

rollback;
