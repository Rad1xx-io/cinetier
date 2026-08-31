-- What migration 016 claims, checked against a running Postgres.
--
-- The finding: the row-level policies on custom_items and custom_tier_rows
-- check who owns the row and never check which column is being written, so an
-- authenticated user could write somebody else's storage path into a row on
-- their own visible board. The storage select policy grants a read to any path
-- a visible row points at, so the picture came back — whatever had been done to
-- the original. That defeats content_moderation, the owner's hidden_at switch
-- and is_public all at once.
--
-- Every scenario below runs as `authenticated` with a real JWT claim, the same
-- as an ordinary browser client, because that is the role the fix is about.
-- Nothing runs as the table owner.
--
-- Read the control first: three of these checks pass when a statement is
-- refused, and a refusal proves nothing unless the same role can be seen doing
-- the allowed version of the same thing.

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'

\set alice_list 'aaaaaaaa-0000-4000-8000-00000000a001'
\set bob_list   'aaaaaaaa-0000-4000-8000-00000000b001'
\set alice_row  'bbbbbbbb-0000-4000-8000-00000000a001'
\set bob_row    'bbbbbbbb-0000-4000-8000-00000000b001'

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
  (:'alice', 'alice@example.test'),
  (:'bob', 'bob@example.test');

-- Both boards public: the exploit does not need a private board of its own,
-- and making Bob's public is what would let the world read what he points it at.
insert into public.custom_tier_lists (id, user_id, title, is_public) values
  (:'alice_list', :'alice', 'Alice''s board', true),
  (:'bob_list', :'bob', 'Bob''s board', true);

insert into public.custom_tier_rows (id, list_id, position, label, color) values
  (:'alice_row', :'alice_list', 0, 'S', '#ef4444'),
  (:'bob_row', :'bob_list', 0, 'S', '#ef4444');

-- Carried as session settings rather than psql variables, the same way
-- 10_rls_checks carries the blocked card's id: a `\set` is substituted before
-- the server sees the statement, which is fine in DDL up here but useless
-- inside the plpgsql blocks below, where the value has to be read at runtime.
select set_config('test.alice_list', :'alice_list', false);
select set_config('test.bob_list', :'bob_list', false);
select set_config('test.alice_row', :'alice_row', false);
select set_config('test.bob_row', :'bob_row', false);

commit;

-- ------------------------------------------- 1. Alice creates a real image --
--
-- Through the actual flow, so the path below is one that genuinely exists and
-- is genuinely referenced — not a string invented by the test.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_path text;
  v_item uuid;
begin
  v_path := public.issue_upload_grant(current_setting('test.alice_list')::uuid, true, 'png', false);

  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(),
          '{"size": 12345, "mimetype": "image/png"}'::jsonb);

  v_item := public.attach_upload(v_path, 'Alice''s picture', null, null);
  if v_item is null then
    raise exception 'FIXTURE FAILED: Alice could not attach her own upload';
  end if;

  -- Handed to the sessions below the way 10_rls_checks does it: a session
  -- setting survives the role change, a psql variable would not.
  perform set_config('test.alice_path', v_path, false);
  raise notice 'FIXTURE: Alice owns a real, attached picture';
end $$;

commit;

-- ---------------------------------------------- control: Bob can still work --
--
-- If this fails, every refusal below is meaningless — it would only show that
-- Bob cannot do anything at all.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_path text;
  v_item uuid;
begin
  -- 6. A legitimate upload by User B still works, end to end.
  v_path := public.issue_upload_grant(current_setting('test.bob_list')::uuid, true, 'png', false);

  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(),
          '{"size": 999, "mimetype": "image/png"}'::jsonb);

  v_item := public.attach_upload(v_path, 'Bob''s own picture', null, null);
  if v_item is null then
    raise exception 'CONTROL FAILED: Bob cannot complete an ordinary upload';
  end if;

  -- And the columns that are legitimately his to edit are still editable.
  update public.custom_items set caption = 'renamed' where id = v_item;
  update public.custom_tier_rows set label = 'A', color = '#00ff00'
  where id = current_setting('test.bob_row')::uuid;

  raise notice 'CONTROL PASSED: Bob can upload, caption and edit his own tiers';
end $$;

commit;

-- ------------------------- 2/3/4. Bob cannot point his own row at the path ---
--
-- This is the vulnerability itself. PostgREST and the JS client are both just
-- clients of this statement — there is no separate "API bypass" to test,
-- because the privilege is the boundary they both go through, and it is the
-- privilege being asserted here.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
begin
  update public.custom_tier_rows
  set image_path = current_setting('test.alice_path')
  where id = current_setting('test.bob_row')::uuid;

  raise exception 'EXPLOIT SUCCEEDED: Bob wrote Alice''s path into his own tier row';
exception
  when insufficient_privilege then
    raise notice 'BLOCKED: Bob may not write custom_tier_rows.image_path';
end $$;

rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_item uuid;
begin
  select id into v_item from public.custom_items
  where list_id = current_setting('test.bob_list')::uuid limit 1;

  update public.custom_items
  set image_path = current_setting('test.alice_path')
  where id = v_item;

  raise exception 'EXPLOIT SUCCEEDED: Bob repointed his own card at Alice''s file';
exception
  when insufficient_privilege then
    raise notice 'BLOCKED: Bob may not write custom_items.image_path';
end $$;

rollback;

-- The other half of the same hole: `Owners write their own custom tiers` is a
-- FOR ALL policy, so INSERT was a way in too. Revoking UPDATE alone would have
-- left this open.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
begin
  insert into public.custom_tier_rows (list_id, position, label, color, image_path)
  values (current_setting('test.bob_list')::uuid, 9, 'Smuggled', '#ffffff',
          current_setting('test.alice_path'));

  raise exception 'EXPLOIT SUCCEEDED: Bob inserted a tier row carrying Alice''s path';
exception
  when insufficient_privilege then
    raise notice 'BLOCKED: Bob may not insert an image_path either';
end $$;

rollback;

-- --------------------------------- 5. No exposed RPC hands the write over ----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_cleared text;
begin
  -- clear_tier_row_image is the one RPC that may write the column. It takes no
  -- path, so the worst it could do is vandalism — and it must not even do that
  -- to a row Bob does not own.
  v_cleared := public.clear_tier_row_image(current_setting('test.alice_row')::uuid);
  if v_cleared is not null then
    raise exception 'EXPLOIT SUCCEEDED: Bob cleared a tier row on Alice''s board';
  end if;

  if exists (
    select 1 from public.custom_tier_rows
    where id = current_setting('test.alice_row')::uuid and image_path is distinct from null
  ) then
    null; -- Alice's row is untouched; the read itself is governed by RLS.
  end if;

  raise notice 'BLOCKED: clear_tier_row_image refuses a row on somebody else''s board';
end $$;

commit;

-- attach_upload must not accept a tier row from another board, in either
-- parameter. Bob mints a real grant on his own list and then aims it at Alice.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_path text;
begin
  v_path := public.issue_upload_grant(current_setting('test.bob_list')::uuid, true, 'png', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(), '{"size": 10, "mimetype": "image/png"}'::jsonb);

  begin
    perform public.attach_upload(v_path, '', null, current_setting('test.alice_row')::uuid);
    raise exception 'EXPLOIT SUCCEEDED: attach_upload wrote a picture onto Alice''s tier';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: attach_upload refuses a tier row from another board';
  end;

  begin
    perform public.attach_upload(v_path, '', current_setting('test.alice_row')::uuid, null);
    raise exception 'EXPLOIT SUCCEEDED: attach_upload filed a card under Alice''s tier';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: attach_upload refuses a cross-board p_row_id';
  end;

  -- Kept for the check below, which cannot run in this session.
  perform set_config('test.bob_grant_path', v_path, false);
end $$;

commit;

/*
 * The refusals above must not have spent the grant, or a mistyped tier id
 * would cost the uploader their file.
 *
 * Asserted outside the authenticated session on purpose: upload_grants has RLS
 * enabled and no policies at all — deliberately, per 012 — so `authenticated`
 * cannot see a single row of it. An earlier draft of this check ran inside the
 * session above and "failed", which was the table's access control working
 * exactly as designed rather than a regression.
 */
do $$
begin
  if not exists (
    select 1 from public.upload_grants
    where image_path = current_setting('test.bob_grant_path') and consumed_at is null
  ) then
    raise exception 'REGRESSION: a refused attach spent the grant anyway';
  end if;

  raise notice 'PASSED: a refused attach leaves the grant usable';
end $$;

-- ------------------------------- 7. A blocked picture cannot be re-served ----
--
-- The scenario the whole fix exists for. Alice's card is blocked by the
-- operator; Bob knows the path. If he could reference it, the storage select
-- policy would find his visible row and sign the url.

begin;

insert into public.content_moderation (subject_type, subject_id, note)
select 'custom_item', i.id, 'test takedown'
from public.custom_items i
where i.image_path = current_setting('test.alice_path');

commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
begin
  -- The write is refused, which is what keeps the block standing.
  begin
    update public.custom_tier_rows
    set image_path = current_setting('test.alice_path')
    where id = current_setting('test.bob_row')::uuid;
    raise exception 'EXPLOIT SUCCEEDED: a blocked picture was re-referenced';
  exception
    when insufficient_privilege then
      null;
  end;

  -- And with no row of his pointing at it, the file stays unreadable to him.
  if exists (
    select 1 from storage.objects
    where bucket_id = 'custom-uploads' and name = current_setting('test.alice_path')
  ) then
    raise exception 'EXPLOIT SUCCEEDED: Bob can still read the blocked object';
  end if;

  raise notice 'BLOCKED: a blocked picture cannot be re-served through another row';
end $$;

rollback;

-- ---------------- 8. A hidden or private board cannot be re-exposed either ---

begin;
delete from public.content_moderation;
update public.custom_tier_lists set is_public = false, hidden_at = now()
where id = current_setting('test.alice_list')::uuid;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
begin
  begin
    update public.custom_tier_rows
    set image_path = current_setting('test.alice_path')
    where id = current_setting('test.bob_row')::uuid;
    raise exception 'EXPLOIT SUCCEEDED: a hidden board''s picture was re-referenced';
  exception
    when insufficient_privilege then
      null;
  end;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'custom-uploads' and name = current_setting('test.alice_path')
  ) then
    raise exception 'EXPLOIT SUCCEEDED: Bob can read a hidden board''s object';
  end if;

  raise notice 'BLOCKED: a hidden/private board''s picture cannot be re-exposed';
end $$;

rollback;

-- ------------------------------------------------------------- privileges ---
--
-- Stated directly as well as demonstrated, so a future grant that quietly
-- widens the surface fails here rather than in production.

do $$
begin
  if has_column_privilege('authenticated', 'public.custom_items', 'image_path', 'UPDATE')
     or has_column_privilege('authenticated', 'public.custom_tier_rows', 'image_path', 'UPDATE')
     or has_column_privilege('authenticated', 'public.custom_tier_rows', 'image_path', 'INSERT') then
    raise exception 'REGRESSION: image_path is writable by authenticated again';
  end if;

  raise notice 'CONFIRMED: image_path is writable only by the upload flow';
end $$;
