-- TierListOnline: a published post keeps the picture it was published with.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This REVERSES a decision migration 013 states in
-- its own header, and it is a change of intent, not a bug fix. 013 says:
--
--   "Everything visual is resolved live, from the cards themselves, every time
--    the post is rendered. That is not an optimisation — it is what makes a
--    takedown work."
--
-- That reasoning was sound and is now superseded by a product decision: a post
-- should behave like a post on any social network — once published, the
-- picture is what it was. Deleting the card from your own board afterwards
-- edits your board, not something other people already read.
--
-- The takedown requirement does NOT go away, and nothing here weakens it. The
-- part 013 got right is that moderation must reach a published post, and it
-- still does — by a different route, described below.
--
-- ----------------------------------------------------------------------------
--
-- WHY THE ROW IS KEPT RATHER THAN THE PATH COPIED.
--
-- The obvious shape is to copy `image_path` into the snapshot and add a second
-- storage grant for "a path some publication mentions". That was rejected
-- after checking three things against this database rather than assuming them:
--
--   1. `custom_items.image_path` is already immutable to every client. 016
--      grants update on exactly (row_id, position, caption, hidden_at) and
--      revokes insert outright — a card's picture can never be swapped for a
--      different one. So a card's row IS the frozen picture; there is nothing
--      the path in a snapshot would protect it from.
--   2. Published posts render card pictures only. Tier pictures exist on the
--      live board and are not part of `PublishedBoard` at all, so the tier
--      image paths never needed freezing.
--   3. `content_moderation` is `(subject_type, subject_id)` with NO foreign
--      keys, so a block is a free-standing fact that outlives its subject.
--
-- Fact 3 is what makes the cheap option safe. Keeping the row means the
-- existing SELECT policy on `custom_items` — which already calls
-- `is_blocked('custom_item', id)` — stays the single place a card's visibility
-- is decided, for the live board and the frozen post alike. A second grant
-- path would have been a second place to get moderation wrong, and moderation
-- is the half 013 was right about.
--
-- It also means the garbage collector needs no new rule: a detached row still
-- references its path, so `removeUnreferencedFiles` already sees the file as
-- in use, at every one of its call sites, without knowing publications exist.
--
-- ----------------------------------------------------------------------------
--
-- WHY DELETE IS REVOKED BELOW.
--
-- `authenticated` holds DELETE on `custom_items` today, so "remove this card"
-- is a direct PostgREST delete. Leaving it there would make the freeze an app
-- convention that any other caller could step around. Deletion goes through
-- the two functions below instead, which decide — in the database, atomically
-- — whether this card is spoken for by a publication. That is the same move
-- 013 made with "no UPDATE policy" and 016 made with column grants: the
-- invariant belongs to the database.

do $$
begin
  if to_regclass('public.custom_items') is null then
    raise exception 'TierListOnline: run migration 012 first — custom boards are missing.';
  end if;
  if to_regclass('public.custom_list_publications') is null then
    raise exception 'TierListOnline: run migration 013 first — publications are missing.';
  end if;
end $$;

-- ---------------------------------------------------------------- the column --

/*
 * Detached, not deleted: off the board, still the post's picture.
 *
 * Deliberately not added to any column grant — nothing outside the two
 * functions below may set or clear it, so a client cannot detach a card it
 * does not own, nor undetach one to make it reappear on a board.
 */
alter table public.custom_items add column if not exists detached_at timestamptz;

create index if not exists custom_items_live_idx
  on public.custom_items (list_id)
  where detached_at is null;

-- -------------------------------------------------------------- one card ----

create or replace function public.remove_custom_item(p_item_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_list uuid;
  v_owner uuid;
begin
  if v_user is null then
    raise exception 'Sign in to edit a board.' using errcode = '42501';
  end if;

  select i.list_id, l.user_id into v_list, v_owner
  from public.custom_items i
  join public.custom_tier_lists l on l.id = i.list_id
  where i.id = p_item_id;

  -- Already gone, or never existed. Not an error: the caller wanted it absent.
  if v_list is null then
    return 'missing';
  end if;

  if v_owner is distinct from v_user then
    raise exception 'That card belongs to someone else.' using errcode = '42501';
  end if;

  -- The same rule delete_custom_board (024) applies: a board under review is
  -- not editable by its own owner, or a report could be answered by deleting
  -- the evidence.
  if public.is_blocked('custom_list', v_list) then
    raise exception 'That board is under review.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.custom_list_publications p
    where p.list_id = v_list
      and p.snapshot -> 'items' @> jsonb_build_array(jsonb_build_object('id', p_item_id::text))
  ) then
    update public.custom_items
    set detached_at = now()
    where id = p_item_id and detached_at is null;
    return 'detached';
  end if;

  delete from public.custom_items where id = p_item_id;
  return 'deleted';
end;
$$;

-- ------------------------------------------------------------ every card ----

/*
 * "Clear the board", with the same distinction drawn per card.
 *
 * One statement each rather than a loop over `remove_custom_item`: the whole
 * point is that a half-cleared board is not a state anyone should be able to
 * observe, and two set-based statements inside one function are atomic where a
 * loop of round trips is not.
 */
create or replace function public.clear_custom_board(p_list_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_deleted integer;
begin
  if v_user is null then
    raise exception 'Sign in to edit a board.' using errcode = '42501';
  end if;

  select l.user_id into v_owner from public.custom_tier_lists l where l.id = p_list_id;
  if v_owner is null then
    raise exception 'That board does not exist.' using errcode = '42501';
  end if;
  if v_owner is distinct from v_user then
    raise exception 'That board belongs to someone else.' using errcode = '42501';
  end if;
  if public.is_blocked('custom_list', p_list_id) then
    raise exception 'That board is under review.' using errcode = '42501';
  end if;

  update public.custom_items i
  set detached_at = now()
  where i.list_id = p_list_id
    and i.detached_at is null
    and exists (
      select 1 from public.custom_list_publications p
      where p.list_id = p_list_id
        and p.snapshot -> 'items' @> jsonb_build_array(jsonb_build_object('id', i.id::text))
    );

  -- Whatever is left unspoken-for. Cards detached by an earlier clear keep
  -- their detached_at and are not touched again.
  delete from public.custom_items where list_id = p_list_id and detached_at is null;
  get diagnostics v_deleted = row_count;

  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------- grants ----

revoke all on function public.remove_custom_item(uuid) from public;
grant execute on function public.remove_custom_item(uuid) to authenticated;
revoke execute on function public.remove_custom_item(uuid) from anon;

revoke all on function public.clear_custom_board(uuid) from public;
grant execute on function public.clear_custom_board(uuid) to authenticated;
revoke execute on function public.clear_custom_board(uuid) from anon;

-- The direct route, closed. See the header: with this still granted, the
-- freeze would be a convention rather than a rule.
revoke delete on public.custom_items from anon, authenticated;

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_bad text;
begin
  -- The 013 invariant, restated: this migration must not have loosened it.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'custom_list_publications' and cmd in ('UPDATE', 'ALL')
  ) then
    raise exception 'TierListOnline: a snapshot must not be updatable — remove that policy.';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'custom_items'
      and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'TierListOnline: a client can still delete cards directly, so a published picture can still be pulled out from under a post.';
  end if;

  -- detached_at must not be writable by a client, or the freeze is opt-out.
  select string_agg(grantee, ', ') into v_bad
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'custom_items'
    and column_name = 'detached_at' and privilege_type = 'UPDATE'
    and grantee in ('anon', 'authenticated');
  if v_bad is not null then
    raise exception 'TierListOnline: % can write custom_items.detached_at directly.', v_bad;
  end if;

  if has_function_privilege('anon', 'public.remove_custom_item(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.clear_custom_board(uuid)', 'EXECUTE') then
    raise exception 'TierListOnline: anon can execute the card-removal functions.';
  end if;

  if not (
    has_function_privilege('authenticated', 'public.remove_custom_item(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.clear_custom_board(uuid)', 'EXECUTE')
  ) then
    raise exception 'TierListOnline: authenticated cannot remove cards — the board would be uneditable.';
  end if;

  raise notice 'TierListOnline: a published card keeps its picture, and removal now runs in the database.';
end $$;
