-- CineTier: allow YouTube channels as a Taste Battle category.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Migration 006 pinned `battles.category` to the three catalogs that map onto a
-- MediaType. Channels live in their own store and never had one, which is the
-- only reason they were left out; nothing about the battle mechanics differs.
--
-- Safe to re-run, and safe on a database that never ran 006 in the first place —
-- both branches are guarded.

do $$
begin
  if to_regclass('public.battles') is null then
    raise exception 'CineTier: run migration 006 first — public.battles is missing.';
  end if;
end $$;

-- The constraint is replaced rather than widened in place: Postgres has no
-- "alter check", and dropping first keeps the script idempotent.
alter table public.battles
  drop constraint if exists battles_category_check;

alter table public.battles
  add constraint battles_category_check
  check (category in ('cinema', 'anime', 'games', 'youtube'));
