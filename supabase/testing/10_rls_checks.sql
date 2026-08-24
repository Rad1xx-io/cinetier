-- What migration 012 claims, checked against a running Postgres.
--
-- Every scenario runs as `authenticated` with a real JWT claim, which is what
-- an ordinary browser client is. Nothing here runs as the table owner, because
-- the table owner is not who these policies are about.
--
-- Read the control section first. Two of these checks pass when a statement is
-- refused, and a refusal proves nothing unless the same role can be shown doing
-- the allowed version of the same thing — otherwise a missing GRANT, a typo in
-- a uuid or an empty table would look exactly like a policy working.

\set ON_ERROR_STOP on

\set alice '11111111-1111-4111-8111-111111111111'
\set bob   '22222222-2222-4222-8222-222222222222'

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

insert into public.custom_tier_lists (id, user_id, title, is_public)
values ('aaaaaaaa-0000-4000-8000-000000000001', :'alice', 'Alice''s board', true);

insert into public.custom_tier_rows (id, list_id, position, label, color)
values ('bbbbbbbb-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001', 0, 'S', '#ef4444');

commit;

-- ------------------------------------------------- control: the happy path --
--
-- Alice adds a card exactly the way the app does: ask for a grant, put the file
-- where the grant says, then attach it. If this fails, nothing below means
-- anything, because the role would be unable to do even what it is allowed.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_path text;
  v_item uuid;
begin
  v_path := public.issue_upload_grant(
    'aaaaaaaa-0000-4000-8000-000000000001', true, 'png', false
  );

  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(),
          '{"size": 12345, "mimetype": "image/png"}'::jsonb);

  v_item := public.attach_upload(v_path, 'A real card', null, null);

  if v_item is null then
    raise exception 'CONTROL FAILED: attach_upload returned nothing';
  end if;
  if not exists (select 1 from public.custom_items where id = v_item) then
    raise exception 'CONTROL FAILED: the card is not readable by its owner';
  end if;

  raise notice 'CONTROL PASSED: an ordinary upload works, so this role is not simply powerless';
end $$;

commit;

-- ------------------------------------- exploit 1: writing without a grant ---
--
-- The finding from review: a folder-wide insert policy let any authenticated
-- client call .storage.upload() straight into its own folder, skipping every
-- check the upload route makes.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_message text;
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('custom-uploads',
            '11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001/sneaky.jpg',
            auth.uid(),
            '{"size": 9, "mimetype": "text/html"}'::jsonb);

    raise exception 'EXPLOIT 1 SUCCEEDED: a file was stored with no grant — the route is optional';
  exception
    when insufficient_privilege then
      get stacked diagnostics v_message = message_text;
      raise notice 'EXPLOIT 1 BLOCKED: %', v_message;
  end;
end $$;

rollback;

-- --------------------------- exploit 2: the owner undoing a takedown --------
--
-- The other finding: moderation lived in a column the content's owner was
-- allowed to write, so hiding a reported picture lasted until its owner
-- edited the board.
--
-- The id is captured here, as the superuser, and handed to the session below.
-- An earlier version looked it up from inside the authenticated session
-- instead — where content_moderation is invisible, so it found nothing,
-- updated `where id = null`, and reported the hole closed on a database where
-- it was wide open. The negative control is what caught that, which is the
-- whole reason 20_negative_control.sql exists.

select id as blocked_id from public.custom_items order by created_at limit 1
\gset

insert into public.content_moderation (subject_type, subject_id, note)
values ('custom_item', :'blocked_id', 'test takedown');

-- Carried in a session setting rather than a psql variable: psql does not
-- substitute variables inside dollar-quoted bodies, so a `:'blocked_id'` in
-- there reaches the server verbatim and is a syntax error.
set my.blocked_id = :'blocked_id';

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_rows integer;
  v_visible integer;
begin
  update public.custom_items set hidden_at = null
  where id = current_setting('my.blocked_id')::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'EXPLOIT 2 SUCCEEDED: the owner un-hid a blocked card (% rows)', v_rows;
  end if;

  select count(*) into v_visible from public.custom_items
  where id = current_setting('my.blocked_id')::uuid;
  if v_visible <> 0 then
    raise exception 'EXPLOIT 2 SUCCEEDED: a blocked card is still readable by its owner';
  end if;

  begin
    delete from public.content_moderation
    where subject_id = current_setting('my.blocked_id')::uuid;
    get diagnostics v_rows = row_count;
    if v_rows <> 0 then
      raise exception 'EXPLOIT 2 SUCCEEDED: the owner deleted their own block';
    end if;
  exception
    when insufficient_privilege then
      null; -- refused outright, which is the same answer more loudly
  end;

  raise notice 'EXPLOIT 2 BLOCKED: a blocked card cannot be un-hidden, read, or unblocked by its owner';
end $$;

rollback;

-- The block must still be standing afterwards, checked from outside the
-- session that tried to remove it.
do $$
begin
  if not exists (
    select 1 from public.content_moderation
    where subject_id = current_setting('my.blocked_id')::uuid
  ) then
    raise exception 'EXPLOIT 2 SUCCEEDED: the block is gone';
  end if;
  raise notice 'CONFIRMED: the block survived the owner';
end $$;

-- ------------------------------------------- the rules around the grant -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

do $$
declare
  v_path text;
begin
  -- Bob, on Alice's board.
  begin
    v_path := public.issue_upload_grant('aaaaaaaa-0000-4000-8000-000000000001', true, 'png', false);
    raise exception 'FAILED: a stranger was granted an upload on somebody else''s board';
  exception
    when insufficient_privilege then
      raise notice 'PASSED: a stranger gets no grant on a board they do not own';
  end;
end $$;

rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

do $$
declare
  v_path text;
begin
  -- The rights box, unticked.
  begin
    v_path := public.issue_upload_grant('aaaaaaaa-0000-4000-8000-000000000001', false, 'png', false);
    raise exception 'FAILED: an upload was granted without the rights confirmation';
  exception
    when invalid_parameter_value then
      raise notice 'PASSED: no grant without the rights confirmation';
  end;

  -- An SVG, by extension.
  begin
    v_path := public.issue_upload_grant('aaaaaaaa-0000-4000-8000-000000000001', true, 'svg', false);
    raise exception 'FAILED: an svg upload was granted';
  exception
    when invalid_parameter_value then
      raise notice 'PASSED: svg is not a format a grant can be issued for';
  end;

  -- A file recorded as something that would run in a browser.
  v_path := public.issue_upload_grant('aaaaaaaa-0000-4000-8000-000000000001', true, 'png', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(),
          '{"size": 400, "mimetype": "image/svg+xml"}'::jsonb);
  begin
    perform public.attach_upload(v_path, 'sneaky', null, null);
    raise exception 'FAILED: a card was attached to a file recorded as image/svg+xml';
  exception
    when invalid_parameter_value then
      raise notice 'PASSED: a card cannot point at something served as svg';
  end;

  -- Oversized, measured from storage rather than claimed.
  v_path := public.issue_upload_grant('aaaaaaaa-0000-4000-8000-000000000001', true, 'jpg', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(),
          '{"size": 5000000, "mimetype": "image/jpeg"}'::jsonb);
  begin
    perform public.attach_upload(v_path, 'huge', null, null);
    raise exception 'FAILED: a 5 MB file was attached';
  exception
    when invalid_parameter_value then
      raise notice 'PASSED: size is read from storage, not from the uploader';
  end;
end $$;

rollback;

-- ------------------------------------------------------------------ done ---

\echo ''
\echo 'All checks ran. Anything that failed would have aborted the script.'
