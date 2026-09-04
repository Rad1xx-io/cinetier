-- TierListOnline: bring the last four security-definer functions onto the
-- empty search_path convention.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. Nothing here changes what any function does. The
-- bodies below are the ones already live, copied unchanged; the only edit is
-- the `set search_path` line on each.
--
-- Why it is worth a migration of its own. A security-definer function runs as
-- its owner, so every unqualified name inside it is resolved with the caller's
-- influence over the search path unless the function pins one. This repository
-- adopted `set search_path = ''` plus fully schema-qualified names from 016 and
-- 017 onward, and said so in those migrations' own comments — but the four
-- functions written before that (`is_blocked`, `has_upload_grant`,
-- `issue_upload_grant` in 012, and `attach_upload` as 016 redefined it) kept
-- `set search_path = public`. Six functions on the new convention, four on the
-- old one, with nothing recording that the split was deliberate — because it
-- was not. It was just the order things were written in.
--
-- Not a live vulnerability, and that was checked rather than assumed: the four
-- bodies are already fully schema-qualified, so they never depended on the
-- search path resolving anything for them, and creating an object that could
-- shadow a name needs CREATE on `public`, which `anon` and `authenticated` do
-- not hold on Supabase. What the old setting costs is the layer underneath
-- that reasoning — the one that keeps holding if a later edit introduces an
-- unqualified name, or if a grant somewhere else changes.
--
-- One trap was found while checking this, and is the reason the conversion was
-- verified against the real database instead of by reading:
-- `issue_upload_grant` calls `gen_random_uuid()` unqualified, and on this
-- project that function exists in BOTH `pg_catalog` and `extensions`. Under an
-- empty search path it still resolves, because `pg_catalog` is searched
-- implicitly and first — the same one that already wins today. `hashtext()`
-- and `pg_advisory_xact_lock()` are `pg_catalog`-only. Verified by querying
-- `pg_proc` on production, not from memory.

do $$
begin
  if to_regclass('public.upload_grants') is null then
    raise exception 'TierListOnline: run migration 012 first — the upload tables are missing.';
  end if;
  if to_regclass('public.custom_tier_rows') is null then
    raise exception 'TierListOnline: run migration 012 first — custom_tier_rows is missing.';
  end if;
end $$;

-- ------------------------------------------------------------- is_blocked --

create or replace function public.is_blocked(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.content_moderation m
    where m.subject_type = p_type and m.subject_id = p_id
  );
$$;

-- Anon on purpose, unchanged: the RLS policies call this for anonymous
-- readers, and revoking it would break every public board. See migration 023.
revoke all on function public.is_blocked(text, uuid) from public;
grant execute on function public.is_blocked(text, uuid) to anon, authenticated;

-- ------------------------------------------------------- has_upload_grant --

create or replace function public.has_upload_grant(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.upload_grants g
    where g.image_path = p_path
      and g.user_id = auth.uid()
      and g.consumed_at is null
      -- A grant is for uploading now, not for keeping.
      and g.created_at > now() - interval '10 minutes'
  );
$$;

-- Deliberately still reachable by anon, for the reason migration 023 records:
-- the storage INSERT policy calls it and is evaluated as the caller, so
-- revoking would turn a clean row-level refusal into a permission error on a
-- function. For anon it is a constant false anyway — `auth.uid()` is null.
revoke all on function public.has_upload_grant(text) from public;
grant execute on function public.has_upload_grant(text) to authenticated;

-- ----------------------------------------------------- issue_upload_grant --

create or replace function public.issue_upload_grant(
  p_list_id uuid,
  p_rights_confirmed boolean,
  p_extension text,
  p_for_tier boolean default false
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_path text;
begin
  if v_user is null then
    raise exception 'Sign in to upload a picture.' using errcode = '42501';
  end if;

  -- Counting and then inserting is two steps, and two requests arriving
  -- together would both read the same count and both be allowed. One lock per
  -- person, held to the end of the transaction, makes the daily limit a limit
  -- rather than a strong suggestion.
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if p_rights_confirmed is not true then
    raise exception 'Confirm you have the right to use this image.' using errcode = '22023';
  end if;

  if p_extension not in ('jpg', 'png', 'webp') then
    raise exception 'Images must be JPEG, PNG or WebP.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.custom_tier_lists l
    where l.id = p_list_id and l.user_id = v_user
  ) then
    raise exception 'That board belongs to someone else.' using errcode = '42501';
  end if;

  -- A tier's own picture is not a card, so it does not count against the
  -- board's card limit — but it does count against the daily one.
  if not p_for_tier and (
    select count(*) from public.custom_items i where i.list_id = p_list_id
  ) >= 100 then
    raise exception 'A board holds up to 100 cards.' using errcode = '23505';
  end if;

  if (
    select count(*) from public.upload_grants g
    where g.user_id = v_user and g.created_at > now() - interval '24 hours'
  ) >= 50 then
    raise exception 'That is 50 uploads today — the limit resets tomorrow.' using errcode = '23505';
  end if;

  v_path := v_user::text || '/' || p_list_id::text || '/' || gen_random_uuid()::text || '.' || p_extension;

  insert into public.upload_grants (user_id, list_id, image_path)
  values (v_user, p_list_id, v_path);

  return v_path;
end;
$$;

revoke all on function public.issue_upload_grant(uuid, boolean, text, boolean) from public;
grant execute on function public.issue_upload_grant(uuid, boolean, text, boolean) to authenticated;
-- The 023 lesson: `revoke all … from public` leaves anon's default-privilege
-- grant untouched, so this has to be spelled out even after a replace.
revoke execute on function public.issue_upload_grant(uuid, boolean, text, boolean) from anon;

-- ---------------------------------------------------------- attach_upload --

create or replace function public.attach_upload(
  p_path text,
  p_caption text default '',
  p_row_id uuid default null,
  p_tier_row_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_grant public.upload_grants%rowtype;
  v_size bigint;
  v_mimetype text;
  v_item uuid;
begin
  select * into v_grant
  from public.upload_grants g
  where g.image_path = p_path and g.user_id = v_user and g.consumed_at is null;

  if not found then
    raise exception 'No upload was granted for that file.' using errcode = '42501';
  end if;

  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o
  where o.bucket_id = 'custom-uploads' and o.name = p_path;

  if v_size is null then
    raise exception 'That file was never uploaded.' using errcode = '22023';
  end if;

  if v_size > 2 * 1024 * 1024 then
    raise exception 'Images must be under 2 MB.' using errcode = '22023';
  end if;

  /*
   * The recorded type decides how the file comes back down the wire, and that
   * makes it a security control rather than a label. An SVG is a document: it
   * can carry <script>, and served as image/svg+xml at a signed url it would
   * run that script on the storage origin. Served as image/png it is a broken
   * picture and nothing more.
   *
   * The uploader chooses this value, so it is not evidence of what the file is
   * — the leading bytes are, and those are read by the upload route. What this
   * guarantees is narrower and still worth having: whatever a card points at
   * is served as one of three image types, so a file that slipped past the
   * route is inert rather than executable.
   */
  select o.metadata ->> 'mimetype' into v_mimetype
  from storage.objects o
  where o.bucket_id = 'custom-uploads' and o.name = p_path;

  if coalesce(v_mimetype, '') not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Images must be JPEG, PNG or WebP.' using errcode = '22023';
  end if;

  -- Both ids must name a tier on the board this grant was issued for. Checked
  -- before the grant is spent, so a refusal costs the caller nothing.
  if p_tier_row_id is not null and not exists (
    select 1 from public.custom_tier_rows r
    where r.id = p_tier_row_id and r.list_id = v_grant.list_id
  ) then
    raise exception 'That tier is not on this board.' using errcode = '42501';
  end if;

  if p_row_id is not null and not exists (
    select 1 from public.custom_tier_rows r
    where r.id = p_row_id and r.list_id = v_grant.list_id
  ) then
    raise exception 'That tier is not on this board.' using errcode = '42501';
  end if;

  update public.upload_grants set consumed_at = now() where id = v_grant.id;

  if p_tier_row_id is not null then
    update public.custom_tier_rows
    set image_path = p_path
    where id = p_tier_row_id and list_id = v_grant.list_id;
    return p_tier_row_id;
  end if;

  insert into public.custom_items (list_id, row_id, position, caption, image_path)
  values (
    v_grant.list_id,
    p_row_id,
    (select coalesce(count(*), 0) from public.custom_items i where i.list_id = v_grant.list_id),
    coalesce(left(p_caption, 120), ''),
    p_path
  )
  returning id into v_item;

  update public.custom_tier_lists set updated_at = now() where id = v_grant.list_id;
  return v_item;
end;
$$;

revoke all on function public.attach_upload(text, text, uuid, uuid) from public;
grant execute on function public.attach_upload(text, text, uuid, uuid) to authenticated;
revoke execute on function public.attach_upload(text, text, uuid, uuid) from anon;

-- ------------------------------------------------------------- self-check --

/*
 * Written against every security-definer function in `public`, not against the
 * four this migration happens to touch. Naming them would pass forever while a
 * future function quietly reintroduces the split this migration exists to
 * close — the same shape of mistake as the test harness's old allowlist.
 */
do $$
declare
  v_loose text;
begin
  select string_agg(p.proname || ' (' || coalesce(array_to_string(p.proconfig, ','), 'no search_path at all') || ')', ', ')
  into v_loose
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=""';

  if v_loose is not null then
    raise exception 'TierListOnline: these security-definer functions are not on the empty search_path convention: %.', v_loose;
  end if;

  -- The other half: the conversion must not have cost anyone their access.
  if not (
    has_function_privilege('anon', 'public.is_blocked(text, uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.attach_upload(text, text, uuid, uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.issue_upload_grant(uuid, boolean, text, boolean)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.has_upload_grant(text)', 'EXECUTE')
  ) then
    raise exception 'TierListOnline: the replace dropped a grant the app needs — uploads or public boards would break.';
  end if;

  if has_function_privilege('anon', 'public.attach_upload(text, text, uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.issue_upload_grant(uuid, boolean, text, boolean)', 'EXECUTE') then
    raise exception 'TierListOnline: anon can execute the upload flow again — migration 023 undone.';
  end if;

  raise notice 'TierListOnline: every security-definer function in public now pins an empty search_path.';
end $$;
