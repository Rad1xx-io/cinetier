-- Whether migration 012 is safe to re-run, which it says it is.
--
-- The finding: 012 creates the `Custom cards follow their list` policy, and 013
-- replaces it because 012's version was wrong — an unqualified `hidden_at`
-- inside a subquery over custom_tier_lists binds to the LIST, so the rule
-- checked the list twice and never checked the card, and a card its owner had
-- hidden stayed visible to everyone.
--
-- Both files use `drop policy if exists` followed by `create policy` on the
-- same name. So on a database that had already had 013 applied, running 012
-- again put the vulnerable version back — no error, no warning, nothing to
-- notice. A migration that says "safe to re-run" has to be safe to re-run.
--
-- This file does not test that the migrations execute. It applies 012 a second
-- time, on a database where 013 has already run, and then checks the security
-- property 013 exists for. That is the only version of this test that would
-- have failed before the fix.

\set ON_ERROR_STOP on

\set owner   'ee111111-1111-4111-8111-111111111101'
\set visitor 'ee111111-1111-4111-8111-111111111102'
\set list    'ea000000-0000-4000-8000-000000000001'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_moderation;
delete from public.upload_grants;
delete from public.custom_items;
delete from public.custom_tier_rows;
delete from public.custom_tier_lists;
delete from storage.objects where bucket_id = 'custom-uploads';
delete from auth.users where id in (:'owner', :'visitor');

insert into auth.users (id, email) values
  (:'owner', 'idem-owner@example.test'),
  (:'visitor', 'idem-visitor@example.test');

-- A PUBLIC list. The bug only shows on one: on a private list the card is
-- hidden by the list's own rule, and the card's own rule never gets a say.
insert into public.custom_tier_lists (id, user_id, title, is_public)
values (:'list', :'owner', 'A public board', true);

insert into public.custom_tier_rows (id, list_id, position, label, color)
values ('eb000000-0000-4000-8000-000000000001', :'list', 0, 'S', '#ef4444');

select set_config('test.list', :'list', false);

commit;

-- The card is created through the real flow, then hidden by its owner.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ee111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
declare
  v_path text;
  v_item uuid;
begin
  v_path := public.issue_upload_grant(current_setting('test.list')::uuid, true, 'png', false);
  insert into storage.objects (bucket_id, name, owner, metadata)
  values ('custom-uploads', v_path, auth.uid(), '{"size": 100, "mimetype": "image/png"}'::jsonb);

  v_item := public.attach_upload(v_path, 'A card the owner hides', null, null);

  update public.custom_items set hidden_at = now() where id = v_item;

  perform set_config('test.item', v_item::text, false);
  raise notice 'FIXTURE: a hidden card on a public board';
end $$;

commit;

-- ------------------------------- the property, before 012 is applied again --

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ee111111-1111-4111-8111-111111111102","role":"authenticated"}';

do $$
begin
  if exists (
    select 1 from public.custom_items where id = current_setting('test.item')::uuid
  ) then
    raise exception 'BASELINE FAILED: a hidden card is visible to a visitor before 012 was re-applied';
  end if;

  raise notice 'BASELINE: a hidden card is invisible to a visitor';
end $$;

-- The owner must still see their own hidden card, or "hidden" would mean
-- "deleted" and this check would pass for the wrong reason.
set local request.jwt.claims = '{"sub":"ee111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  if not exists (
    select 1 from public.custom_items where id = current_setting('test.item')::uuid
  ) then
    raise exception 'BASELINE FAILED: the owner cannot see their own hidden card';
  end if;

  raise notice 'BASELINE: the owner still sees their own hidden card';
end $$;

commit;

-- ----------------------------------------------- re-apply migration 012 ----
--
-- The whole point of the file. `\ir` resolves relative to this script, so this
-- is the same file the deployment would run, not a copy that could drift.

\echo '--- re-applying migration 012 on top of 013 ---'
\ir ../migrations/012_custom_tier_lists.sql
\echo '--- migration 012 re-applied ---'

-- ------------------------------ the same property, after 012 ran again -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ee111111-1111-4111-8111-111111111102","role":"authenticated"}';

do $$
begin
  if exists (
    select 1 from public.custom_items where id = current_setting('test.item')::uuid
  ) then
    raise exception 'REGRESSION SUCCEEDED: re-running 012 made a hidden card visible again';
  end if;

  raise notice 'PASSED: a hidden card stays hidden after 012 is re-applied';
end $$;

commit;

-- And the rest of what 012's policy governs, checked in the same state: an
-- anonymous visitor sees no more than a signed-in stranger.
begin;
set local role anon;
-- What PostgREST sends for an anonymous request. Without it the stub's
-- `current_setting(...)::jsonb` cast meets an empty string left behind by an
-- earlier `set local`, which is a parse error rather than "no session".
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  if exists (
    select 1 from public.custom_items where id = current_setting('test.item')::uuid
  ) then
    raise exception 'REGRESSION SUCCEEDED: a hidden card is visible to anonymous visitors';
  end if;

  raise notice 'PASSED: a hidden card is invisible anonymously too';
end $$;

commit;

-- Blocking still works after the re-run — the other half of what this policy
-- carries, and the half a re-applied 012 could equally have broken.
begin;
insert into public.content_moderation (subject_type, subject_id, note)
values ('custom_item', current_setting('test.item')::uuid, 'idempotency check');
update public.custom_items set hidden_at = null where id = current_setting('test.item')::uuid;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ee111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  -- Un-hidden, but blocked: invisible even to the person who owns it.
  if exists (
    select 1 from public.custom_items where id = current_setting('test.item')::uuid
  ) then
    raise exception 'REGRESSION SUCCEEDED: a blocked card is visible to its owner after 012 was re-applied';
  end if;

  raise notice 'PASSED: a blocked card stays blocked after 012 is re-applied';
end $$;

commit;

-- ------------------------------------------------- the policy text itself --
--
-- Stated as well as demonstrated. If the qualified reference is ever dropped
-- again this names the reason rather than leaving a future reader to work out
-- why a card went visible.

do $$
declare
  v_qual text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'custom_items'
    and policyname = 'Custom cards follow their list';

  if v_qual is null then
    raise exception 'REGRESSION: the custom_items select policy is missing entirely';
  end if;

  if v_qual not like '%custom_items.hidden_at%' then
    raise exception 'REGRESSION: the policy no longer qualifies hidden_at — it is checking the list twice and the card never.';
  end if;

  raise notice 'CONFIRMED: the policy qualifies hidden_at to the card';
end $$;

begin;
delete from public.content_moderation;
commit;
