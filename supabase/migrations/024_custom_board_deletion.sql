-- TierListOnline: let a board's owner delete it, post and all.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. The database has allowed this since migration 012
-- — "Owners delete their own custom lists" is a real RLS policy, and has been
-- since the board's own tables were created. What was missing was anywhere in
-- the app to ask: the boards list had no delete control at all, only
-- `deletePost` for an already-published post in the feed. Same shape of gap,
-- same reasoning as the one that closed it: the person who put a board there
-- should be able to take it back.
--
-- A plain `delete from custom_tier_lists` is not quite enough, which is why
-- this is a function rather than the client deleting that row directly.
-- Tiers and cards cascade away with the board (`on delete cascade`, migration
-- 012), and so does the publication row if the board has been published
-- (`custom_list_publications.list_id … on delete cascade`, migration 013) —
-- but the POST itself does not. `posts` carries no foreign key back to the
-- board it was published from, so deleting only the board leaves the post
-- behind: still in the feed, still under its author's name, with nothing left
-- to render — the exact hole an empty publish leaves (see the companion fix
-- in publishCustomBoard), just reached through a different door. This
-- function deletes the post first, when one exists, so the whole thing goes
-- together.
--
-- Ownership and the moderation block are both re-checked inside the function
-- rather than assumed from the caller reaching it at all — the same
-- discipline as every other security-definer function here. In particular: a
-- BLOCKED board cannot be deleted by its owner, matching the existing RLS
-- delete policy on custom_tier_lists exactly. A block its subject can delete
-- their way out of is not a block — it would let an owner destroy the
-- evidence a report is about.
--
-- The publication lookup below reads custom_list_publications directly rather
-- than through the ordinary client, on purpose. That table's SELECT policy is
-- about what a *reader* may see — it hides a board its owner has quietly
-- paused (`hidden_at`) from everyone, itself included, because nothing today
-- ever sets that column from the UI, but a future feature that adds a "pause"
-- toggle would otherwise make this function silently stop finding — and
-- therefore stop deleting — the post behind a paused board. Going around that
-- policy here is safe only because this function re-derives ownership itself,
-- from auth.uid(), before it looks at anything.

do $$
begin
  if to_regclass('public.custom_tier_lists') is null then
    raise exception 'TierListOnline: run migration 012 first — the custom board tables are missing.';
  end if;
  if to_regclass('public.custom_list_publications') is null then
    raise exception 'TierListOnline: run migration 013 first — custom_list_publications is missing.';
  end if;
end $$;

-- --------------------------------------------------------------- the RPC --

/*
 * Deletes a board and, if it has one, the post that shows it.
 *
 * Returns whether a post was also removed, so the caller can say which of the
 * two things just happened rather than guessing from silence.
 */
create or replace function public.delete_custom_board(p_list_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_post_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in to delete a board.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.custom_tier_lists l
    where l.id = p_list_id and l.user_id = v_user
  ) then
    raise exception 'That board does not exist, or is not yours.' using errcode = '42501';
  end if;

  if public.is_blocked('custom_list', p_list_id) then
    raise exception 'This board is under review and cannot be deleted right now.' using errcode = '42501';
  end if;

  select p.post_id into v_post_id
  from public.custom_list_publications p
  where p.list_id = p_list_id;

  if v_post_id is not null then
    delete from public.posts where id = v_post_id and user_id = v_user;
  end if;

  delete from public.custom_tier_lists where id = p_list_id and user_id = v_user;

  return v_post_id is not null;
end;
$$;

revoke all on function public.delete_custom_board(uuid) from public;
grant execute on function public.delete_custom_board(uuid) to authenticated;
-- Same reasoning as migration 023: `revoke all … from public` does not touch
-- `anon`'s default-privilege grant, and this function's own auth.uid() check
-- is meant to be the second line of defence, not the only one.
revoke execute on function public.delete_custom_board(uuid) from anon;

-- ------------------------------------------------------------- self-check --

/*
 * Structural only — the same split every migration here uses. What this
 * function actually does to a board, a post and a blocked list is exercised
 * behaviourally, as a different account and a real JWT claim, in
 * supabase/testing/21_custom_board_deletion_checks.sql — not run in
 * production, only by the local harness.
 */
do $$
declare
  v_leaky text;
begin
  select string_agg(p.proname, ', ') into v_leaky
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_custom_board'
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_leaky is not null then
    raise exception 'TierListOnline: anon can execute delete_custom_board.';
  end if;

  if not has_function_privilege('authenticated', 'public.delete_custom_board(uuid)', 'EXECUTE') then
    raise exception 'TierListOnline: authenticated cannot execute delete_custom_board — boards could not be deleted at all.';
  end if;

  raise notice 'TierListOnline: a board and its post, if it has one, can now be deleted by its owner.';
end $$;
