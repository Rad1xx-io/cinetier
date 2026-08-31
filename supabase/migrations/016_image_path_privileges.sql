-- TierListOnline: make image_path something only the upload flow can write.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This closes a hole that made the takedown promise
-- in migration 012 untrue.
--
-- 012 says a blocked card "is gone from every read path, including the signed
-- urls that serve its pictures". That holds only while a picture has exactly
-- one row pointing at it. The row-level policies on custom_items and
-- custom_tier_rows check *who owns the row* and never check *which column is
-- being written*, and nothing ever restricted the columns themselves — so an
-- ordinary authenticated user could take a path they had seen once and write
-- it into a row on their own public board:
--
--   PATCH /rest/v1/custom_tier_rows?id=eq.<their own row>
--   { "image_path": "<somebody else's path>" }
--
-- The storage select policy grants a read to any path referenced by a visible
-- row, so their own visible row re-served the file. Whatever had been done to
-- the original — blocked in content_moderation, hidden by its owner, or on a
-- board turned private — applied to the original row, not to the new one. The
-- picture came back.
--
-- The fix is to stop treating image_path as user data. There is exactly one
-- legitimate way for a path to enter this database: issue_upload_grant mints
-- it, Storage receives the bytes, attach_upload writes it down. That flow runs
-- as the function owner and is unaffected by anything below. Everything else
-- loses the privilege entirely — not by policy, which is per-row, but by
-- column grant, which PostgREST cannot argue with.
--
-- Also fixed here, because it is in the same function and the same upload
-- path: attach_upload accepted a tier row id belonging to any board at all.

do $$
begin
  if to_regclass('public.custom_tier_rows') is null then
    raise exception 'TierListOnline: run migration 012 first — the custom board tables are missing.';
  end if;
end $$;

-- ------------------------------------------------- column-level privileges --

/*
 * Table-wide UPDATE covers every column, and a column-level grant cannot take
 * anything away from it — the two are additive. So the broad grant goes first
 * and the columns that are genuinely the user's to edit are handed back one by
 * one. image_path is in neither list, which is the whole point.
 *
 * SELECT and DELETE are untouched: reading and removing your own row were
 * never the problem, and revoking them here would break the board.
 */

-- A card's own writable surface: where it sits, what it is called, and whether
-- its owner has it hidden. Not which file it is.
revoke update on public.custom_items from anon, authenticated;
grant update (row_id, position, caption, hidden_at) on public.custom_items to authenticated;

-- custom_items has no insert policy at all (012 asserts this), so cards can
-- only be born inside attach_upload. Nothing to re-grant.
revoke insert on public.custom_items from anon, authenticated;

/*
 * A tier row is different: the app really does insert these directly, when a
 * board is created and when a tier is added. That path is kept, minus the one
 * column it never supplies.
 *
 * This matters as much as the update grant. `Owners write their own custom
 * tiers` is a FOR ALL policy, so it covers INSERT too — without this, the same
 * attack works by inserting a fresh tier row carrying someone else's path
 * instead of updating an existing one.
 */
revoke insert, update on public.custom_tier_rows from anon, authenticated;
grant insert (list_id, position, label, color) on public.custom_tier_rows to authenticated;
grant update (position, label, color) on public.custom_tier_rows to authenticated;

-- ------------------------------------------- clearing a tier row's picture --

/*
 * The one legitimate direct write to image_path that the app performs, and the
 * only reason this function needs to exist.
 *
 * "Remove this tier's picture" is a real feature (custom-board.tsx's
 * handleClearRowImage) and it used to be an ordinary update. It cannot be one
 * any more, so it becomes an RPC — deliberately the narrowest one that does
 * the job.
 *
 * Held to the same standard as attach_upload, since it is security definer:
 *
 *   * It can only ever write NULL. There is no parameter for a path, so even a
 *     total failure of the ownership check below could not point a row at
 *     somebody else's file — the worst case is vandalism, not disclosure.
 *     That is a deliberate choice over a general `set_tier_row_image(path)`,
 *     which would have re-created the hole this migration closes.
 *   * Ownership is checked against custom_tier_lists.user_id, not taken from
 *     any argument.
 *   * A blocked board stays frozen, matching the update policy in 012: a block
 *     that its subject can edit around is not a block.
 *   * search_path is empty and every name is schema-qualified, so nothing here
 *     can be resolved through a table planted in a schema the caller controls.
 *
 * Returns the path it cleared so the caller can garbage-collect the file, and
 * NULL when nothing matched — which is what an unauthorised call gets, with no
 * detail about whether the row existed.
 */
create or replace function public.clear_tier_row_image(p_row_id uuid)
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
    raise exception 'Sign in to edit a board.' using errcode = '42501';
  end if;

  select r.image_path into v_path
  from public.custom_tier_rows r
  join public.custom_tier_lists l on l.id = r.list_id
  where r.id = p_row_id
    and l.user_id = v_user
    and not public.is_blocked('custom_list', l.id);

  if not found then
    -- Not this user's row, or the board is blocked. Same answer either way.
    return null;
  end if;

  update public.custom_tier_rows
  set image_path = null
  where id = p_row_id;

  return v_path;
end;
$$;

revoke all on function public.clear_tier_row_image(uuid) from public;
grant execute on function public.clear_tier_row_image(uuid) to authenticated;

-- --------------------------------------- attach_upload: cross-list integrity --

/*
 * Unchanged except for the two ownership checks and where the grant is spent.
 *
 * What was wrong: p_row_id was inserted verbatim. list_id came from the grant
 * and was therefore always the caller's own board, but row_id was whatever the
 * caller sent — including a tier row on somebody else's list. The read paths
 * all scope by list_id, so this never put a card on another person's board,
 * but it wrote a foreign key across two users' data and left the row's
 * placement dependent on a row its owner cannot see.
 *
 * p_tier_row_id had the ownership condition in the UPDATE's WHERE clause, so
 * it could not touch another board — but a mismatch matched zero rows and
 * still returned success, after the grant had already been spent. The file
 * stayed in the bucket, referenced by nothing.
 *
 * Both are now checked up front, and the grant is spent only once those checks
 * have passed, so a rejected attach leaves the grant usable.
 */
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
set search_path = public
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

-- ------------------------------------------------------------- self-check --

/*
 * Running this migration is also the test that it did what it says — the same
 * convention 012 and 013 use. Every assertion below is about the privilege
 * itself, not about a policy, because a policy decides which rows a statement
 * may touch and this is about which columns exist to be written at all.
 */
do $$
begin
  if has_column_privilege('authenticated', 'public.custom_items', 'image_path', 'UPDATE') then
    raise exception 'TierListOnline: authenticated can still write custom_items.image_path.';
  end if;

  if has_column_privilege('authenticated', 'public.custom_tier_rows', 'image_path', 'UPDATE') then
    raise exception 'TierListOnline: authenticated can still write custom_tier_rows.image_path.';
  end if;

  if has_column_privilege('authenticated', 'public.custom_tier_rows', 'image_path', 'INSERT') then
    raise exception 'TierListOnline: authenticated can still insert custom_tier_rows.image_path.';
  end if;

  if has_column_privilege('anon', 'public.custom_tier_rows', 'image_path', 'UPDATE')
     or has_column_privilege('anon', 'public.custom_items', 'image_path', 'UPDATE') then
    raise exception 'TierListOnline: anon can still write an image_path.';
  end if;

  -- The other half: the board must still be editable, or this migration has
  -- traded a vulnerability for an outage.
  if not has_column_privilege('authenticated', 'public.custom_items', 'caption', 'UPDATE') then
    raise exception 'TierListOnline: captions are no longer editable — the re-grant did not land.';
  end if;

  if not has_column_privilege('authenticated', 'public.custom_items', 'row_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.custom_items', 'position', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.custom_items', 'hidden_at', 'UPDATE') then
    raise exception 'TierListOnline: cards can no longer be moved or hidden.';
  end if;

  if not has_column_privilege('authenticated', 'public.custom_tier_rows', 'label', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.custom_tier_rows', 'color', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.custom_tier_rows', 'position', 'UPDATE') then
    raise exception 'TierListOnline: tiers can no longer be renamed, recoloured or reordered.';
  end if;

  if not has_column_privilege('authenticated', 'public.custom_tier_rows', 'label', 'INSERT')
     or not has_column_privilege('authenticated', 'public.custom_tier_rows', 'list_id', 'INSERT') then
    raise exception 'TierListOnline: new tiers can no longer be created.';
  end if;

  raise notice 'TierListOnline: image_path is now writable only through the upload flow.';
end $$;
