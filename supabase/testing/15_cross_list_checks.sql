-- What migrations 016 and 020 claim between them: a card's tier is on the
-- card's own board, and there is no way to write down that it is not.
--
-- 016 put the check inside `attach_upload`, which is where a card is created.
-- 020 made it a constraint, which is what covers `custom_items.row_id` — an
-- ordinary column with an ordinary UPDATE grant, reachable from PostgREST by
-- anyone with a session, and the column `moveItem()` writes on every drag.
--
-- The distinction the two halves are testing is worth stating plainly, because
-- it is what decides whether the constraint is redundant:
--
--   * attach_upload refuses a foreign tier at CREATE time.
--   * the composite foreign key refuses one at UPDATE time, which
--     attach_upload never sees.
--
-- The same-owner case matters as much as the cross-owner one. Two boards
-- belonging to the same person are still two boards, and every read path scopes
-- by list_id — so a card filed under the other board's tier is a card that
-- shows up nowhere, pointing at a row its own board has never heard of.

\set ON_ERROR_STOP on

\set alice 'cc111111-1111-4111-8111-111111111101'
\set bob   'cc111111-1111-4111-8111-111111111102'

\set alice_list  'ca000000-0000-4000-8000-0000000000a1'
\set alice_other 'ca000000-0000-4000-8000-0000000000a2'
\set bob_list    'ca000000-0000-4000-8000-0000000000b1'

\set alice_row   'cb000000-0000-4000-8000-0000000000a1'
\set other_row   'cb000000-0000-4000-8000-0000000000a2'
\set bob_row     'cb000000-0000-4000-8000-0000000000b1'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_moderation;
delete from public.upload_grants;
delete from public.custom_items;
delete from public.custom_tier_rows;
delete from public.custom_tier_lists;
delete from storage.objects where bucket_id = 'custom-uploads';
delete from auth.users where id in (:'alice', :'bob');

insert into auth.users (id, email) values
  (:'alice', 'xl-alice@example.test'),
  (:'bob', 'xl-bob@example.test');

-- Alice owns TWO boards. That second one is what makes the same-owner case
-- testable, and it is the case a cross-user check on its own would miss.
insert into public.custom_tier_lists (id, user_id, title, is_public) values
  (:'alice_list', :'alice', 'Alice board one', true),
  (:'alice_other', :'alice', 'Alice board two', true),
  (:'bob_list', :'bob', 'Bob board', true);

insert into public.custom_tier_rows (id, list_id, position, label, color) values
  (:'alice_row', :'alice_list', 0, 'S', '#ef4444'),
  (:'other_row', :'alice_other', 0, 'S', '#f59e0b'),
  (:'bob_row', :'bob_list', 0, 'S', '#8b5cf6');

select set_config('test.alice_list', :'alice_list', false);
select set_config('test.alice_other', :'alice_other', false);
select set_config('test.bob_list', :'bob_list', false);
select set_config('test.alice_row', :'alice_row', false);
select set_config('test.other_row', :'other_row', false);
select set_config('test.bob_row', :'bob_row', false);

commit;

-- --------------------------- 1. control: the same-board case still works ----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cc111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
declare
  v_path text;
  v_item uuid;
begin
  v_path := public.issue_upload_grant(current_setting('test.alice_list')::uuid, true, 'png', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(), '{"size": 100, "mimetype": "image/png"}'::jsonb);

  v_item := public.attach_upload(v_path, 'On its own board', current_setting('test.alice_row')::uuid, null);

  if v_item is null then
    raise exception 'CONTROL FAILED: a card could not be filed under a tier on its own board';
  end if;

  if not exists (
    select 1 from public.custom_items
    where id = v_item and row_id = current_setting('test.alice_row')::uuid
  ) then
    raise exception 'CONTROL FAILED: the card did not keep the tier it was given';
  end if;

  perform set_config('test.alice_item', v_item::text, false);
  raise notice 'CONTROL PASSED: a card files under a tier on its own board';
end $$;

commit;

-- ---------------- 2/3/4/5. attach_upload refuses every foreign tier ---------
--
-- Called directly, as the RPC, with a genuine grant on a board the caller
-- genuinely owns. The only thing wrong in each case is the tier id.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cc111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
declare
  v_path text;
begin
  v_path := public.issue_upload_grant(current_setting('test.alice_list')::uuid, true, 'png', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(), '{"size": 100, "mimetype": "image/png"}'::jsonb);

  -- 2. Another user's list.
  begin
    perform public.attach_upload(v_path, '', current_setting('test.bob_row')::uuid, null);
    raise exception 'EXPLOIT SUCCEEDED: p_row_id from another user''s board was accepted';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: p_row_id from another user''s board';
  end;

  -- 3. Another board owned by the SAME user. Ownership is not the question —
  -- the grant names one board, and this is not it.
  begin
    perform public.attach_upload(v_path, '', current_setting('test.other_row')::uuid, null);
    raise exception 'EXPLOIT SUCCEEDED: p_row_id from the caller''s OTHER board was accepted';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: p_row_id from another board owned by the same person';
  end;

  -- 4. The tier-picture parameter, same two cases.
  begin
    perform public.attach_upload(v_path, '', null, current_setting('test.bob_row')::uuid);
    raise exception 'EXPLOIT SUCCEEDED: p_tier_row_id from another user''s board was accepted';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: p_tier_row_id from another user''s board';
  end;

  begin
    perform public.attach_upload(v_path, '', null, current_setting('test.other_row')::uuid);
    raise exception 'EXPLOIT SUCCEEDED: p_tier_row_id from the caller''s OTHER board was accepted';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: p_tier_row_id from another board owned by the same person';
  end;

  perform set_config('test.unspent_path', v_path, false);
end $$;

commit;

-- 7. Four refusals, and the grant is still there to be used.
do $$
begin
  if not exists (
    select 1 from public.upload_grants
    where image_path = current_setting('test.unspent_path') and consumed_at is null
  ) then
    raise exception 'REGRESSION: the refused attaches spent the grant';
  end if;

  raise notice 'PASSED: four refused attaches left the grant usable';
end $$;

-- ------------- 6. the constraint covers the column attach_upload never sees --
--
-- `custom_items.row_id` is writable through PostgREST — it is what a drag
-- writes — and the RLS policy on that table checks the row's list_id and
-- nothing about the tier it is being moved to. Before migration 020 this
-- succeeded.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cc111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  begin
    update public.custom_items
    set row_id = current_setting('test.bob_row')::uuid
    where id = current_setting('test.alice_item')::uuid;

    raise exception 'EXPLOIT SUCCEEDED: a card was moved into another user''s tier';
  exception
    when foreign_key_violation then
      raise notice 'BLOCKED: a card cannot be moved into another user''s tier';
  end;

  begin
    update public.custom_items
    set row_id = current_setting('test.other_row')::uuid
    where id = current_setting('test.alice_item')::uuid;

    raise exception 'EXPLOIT SUCCEEDED: a card was moved into the owner''s other board''s tier';
  exception
    when foreign_key_violation then
      raise notice 'BLOCKED: a card cannot be moved into another board''s tier, same owner or not';
  end;

  -- The move that is legitimate must still work, or this constraint has traded
  -- a defect for a broken drag.
  update public.custom_items
  set row_id = current_setting('test.alice_row')::uuid, position = 3
  where id = current_setting('test.alice_item')::uuid;

  update public.custom_items
  set row_id = null
  where id = current_setting('test.alice_item')::uuid;

  raise notice 'CONTROL PASSED: a card still moves within its own board, and back to the pool';
end $$;

rollback;

-- ------------------------------- the behaviour 012 chose, still in place ----
--
-- Deleting a tier returns its cards to the pool rather than destroying them.
-- The composite key had to keep `on delete set null` for that to remain true,
-- and a foreign key is exactly the kind of thing that quietly changes it.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"cc111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  update public.custom_items
  set row_id = current_setting('test.alice_row')::uuid
  where id = current_setting('test.alice_item')::uuid;

  delete from public.custom_tier_rows where id = current_setting('test.alice_row')::uuid;

  if not exists (
    select 1 from public.custom_items
    where id = current_setting('test.alice_item')::uuid and row_id is null
  ) then
    raise exception 'REGRESSION: deleting a tier destroyed its cards instead of returning them to the pool';
  end if;

  raise notice 'PASSED: deleting a tier still returns its cards to the pool';
end $$;

rollback;

-- --------------------------------------------------------- the constraint ---

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'custom_items_list_row_fk' and conrelid = 'public.custom_items'::regclass
  ) then
    raise exception 'REGRESSION: the composite tier foreign key is gone';
  end if;

  raise notice 'CONFIRMED: (list_id, row_id) must name a tier on the same board';
end $$;
