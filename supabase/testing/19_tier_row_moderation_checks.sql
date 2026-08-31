-- What migration 022 claims: a tier's picture is moderated like any other.
--
-- The gap: `custom_tier_rows.image_path` is an uploaded picture, written by
-- `attach_upload` through the same grant flow as a card and served from the
-- same bucket — but `content_moderation` and `content_reports` both accepted
-- only 'custom_item' and 'custom_list'. A tier picture could not be reported
-- and could not be taken down except by blocking the whole board with every
-- other picture on it.
--
-- The load-bearing assertion here is the storage one. 012's storage policy
-- resolves a tier picture by asking whether any *visible* tier row points at
-- it, and that subquery runs under the reader's own RLS — so the block only
-- reaches the signed url if the tier row's SELECT policy consults the
-- moderation table. That is the clause 022 adds, and the storage policy itself
-- is deliberately untouched.

\set ON_ERROR_STOP on

\set owner    'ba000000-1111-4111-8111-000000000001'
\set visitor  'ba000000-1111-4111-8111-000000000002'
\set list     'bb000000-0000-4000-8000-000000000001'
\set other_list 'bb000000-0000-4000-8000-000000000002'
\set row_id   'bc000000-0000-4000-8000-000000000001'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_moderation;
delete from public.content_reports;
delete from public.upload_grants;
delete from public.custom_items;
delete from public.custom_tier_rows;
delete from public.custom_tier_lists;
delete from storage.objects where bucket_id = 'custom-uploads';
delete from auth.users where id in (:'owner', :'visitor');

insert into auth.users (id, email) values
  (:'owner', 'tr-owner@example.test'),
  (:'visitor', 'tr-visitor@example.test');

insert into public.custom_tier_lists (id, user_id, title, is_public) values
  (:'list', :'owner', 'A public board', true),
  (:'other_list', :'visitor', 'Somebody else''s board', true);

insert into public.custom_tier_rows (id, list_id, position, label, color)
values (:'row_id', :'list', 0, 'S', '#ef4444');

select set_config('test.list', :'list', false);
select set_config('test.row', :'row_id', false);

commit;

-- The tier gets a real picture, through the real flow.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ba000000-1111-4111-8111-000000000001","role":"authenticated"}';

do $$
declare
  v_path text;
begin
  v_path := public.issue_upload_grant(current_setting('test.list')::uuid, true, 'png', true);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(), '{"size": 500, "mimetype": "image/png"}'::jsonb);

  perform public.attach_upload(v_path, '', null, current_setting('test.row')::uuid);
  perform set_config('test.path', v_path, false);

  raise notice 'FIXTURE: a tier on a public board carries a real picture';
end $$;

commit;

-- ------------------------ control: the picture is visible before any block ---

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  if not exists (
    select 1 from public.custom_tier_rows where id = current_setting('test.row')::uuid
  ) then
    raise exception 'CONTROL FAILED: the tier row is not visible to begin with';
  end if;

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'custom-uploads' and name = current_setting('test.path')
  ) then
    raise exception 'CONTROL FAILED: the tier picture is not readable to begin with — a later block would prove nothing';
  end if;

  raise notice 'CONTROL PASSED: the tier picture is readable before it is blocked';
end $$;

commit;

-- ------------------------------------------ 1. a visitor can report the tier --

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ba000000-1111-4111-8111-000000000002","role":"authenticated"}';

do $$
begin
  insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
  values (auth.uid(), 'custom_tier_row', current_setting('test.row')::uuid, 'That is not their photo.');

  raise notice 'PASSED: a tier picture can be reported';
end $$;

commit;

-- ---------------------------------- 2. an anonymous visitor cannot report ----

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values (null, 'custom_tier_row', current_setting('test.row')::uuid, 'Anonymous complaint.');

    raise exception 'EXPLOIT SUCCEEDED: an anonymous visitor filed a report';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: reporting still requires an account';
  end;
end $$;

rollback;

-- ------------------- 3. a report cannot be filed in somebody else's name ----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ba000000-1111-4111-8111-000000000002","role":"authenticated"}';

do $$
begin
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values ('ba000000-1111-4111-8111-000000000001'::uuid, 'custom_tier_row',
            current_setting('test.row')::uuid, 'Filed as the owner.');

    raise exception 'EXPLOIT SUCCEEDED: a report was filed under another account''s id';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: a tier-row report cannot be filed under another account''s id';
  end;
end $$;

rollback;

-- ------------------------------- 5. a blocked tier picture stops being served --
--
-- The one that matters. The block goes in as the operator would put it in, and
-- the storage read is then attempted as an ordinary anonymous visitor.

begin;
insert into public.content_moderation (subject_type, subject_id, note)
values ('custom_tier_row', current_setting('test.row')::uuid, 'test takedown');
commit;

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  if exists (
    select 1 from public.custom_tier_rows where id = current_setting('test.row')::uuid
  ) then
    raise exception 'EXPLOIT SUCCEEDED: a blocked tier row is still visible';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'custom-uploads' and name = current_setting('test.path')
  ) then
    raise exception 'EXPLOIT SUCCEEDED: a blocked tier picture can still be signed and served';
  end if;

  raise notice 'BLOCKED: a blocked tier picture is gone from the board and from storage';
end $$;

commit;

-- 6. And the owner cannot edit their way out of it, the same as a card.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ba000000-1111-4111-8111-000000000001","role":"authenticated"}';

do $$
begin
  if exists (
    select 1 from public.custom_tier_rows where id = current_setting('test.row')::uuid
  ) then
    raise exception 'EXPLOIT SUCCEEDED: the owner can still see their blocked tier row';
  end if;

  -- content_moderation must remain unreachable: no reading it, no deleting from it.
  begin
    delete from public.content_moderation
    where subject_type = 'custom_tier_row' and subject_id = current_setting('test.row')::uuid;
    if found then
      raise exception 'EXPLOIT SUCCEEDED: the owner deleted the block on their own content';
    end if;
  exception
    when insufficient_privilege then
      null;
  end;

  raise notice 'BLOCKED: the owner can neither see nor lift the block';
end $$;

rollback;

-- The block must still be standing, checked from outside the session above.
do $$
begin
  if not exists (
    select 1 from public.content_moderation
    where subject_type = 'custom_tier_row' and subject_id = current_setting('test.row')::uuid
  ) then
    raise exception 'EXPLOIT SUCCEEDED: the block did not survive the owner';
  end if;

  raise notice 'CONFIRMED: the tier-row block survived its owner';
end $$;

-- ------------------------------ 7. the existing card path still behaves -----

begin;
delete from public.content_moderation;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ba000000-1111-4111-8111-000000000001","role":"authenticated"}';

do $$
declare
  v_path text;
  v_item uuid;
begin
  v_path := public.issue_upload_grant(current_setting('test.list')::uuid, true, 'png', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(), '{"size": 400, "mimetype": "image/png"}'::jsonb);
  v_item := public.attach_upload(v_path, 'An ordinary card', null, null);

  perform set_config('test.item', v_item::text, false);
  perform set_config('test.item_path', v_path, false);
end $$;

commit;

begin;
insert into public.content_moderation (subject_type, subject_id, note)
values ('custom_item', current_setting('test.item')::uuid, 'still works');
commit;

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  if exists (select 1 from public.custom_items where id = current_setting('test.item')::uuid) then
    raise exception 'REGRESSION: blocking a card no longer hides it';
  end if;

  if exists (
    select 1 from storage.objects
    where bucket_id = 'custom-uploads' and name = current_setting('test.item_path')
  ) then
    raise exception 'REGRESSION: a blocked card''s picture is served again';
  end if;

  -- And the tier row, no longer blocked, is back.
  if not exists (
    select 1 from public.custom_tier_rows where id = current_setting('test.row')::uuid
  ) then
    raise exception 'REGRESSION: lifting a tier-row block did not restore it';
  end if;

  raise notice 'PASSED: card moderation is unchanged, and lifting a tier block restores it';
end $$;

commit;

-- ------------------------------------------------------ the subject types ---

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_reports_subject_type_check'
      and pg_get_constraintdef(oid) like '%custom_tier_row%'
      and pg_get_constraintdef(oid) like '%post_comment%'
  ) then
    raise exception 'REGRESSION: the report subject types are wrong — 015''s or 022''s are missing';
  end if;

  raise notice 'CONFIRMED: reports accept tier rows without having lost the feed types';
end $$;

begin;
delete from public.content_moderation;
commit;
