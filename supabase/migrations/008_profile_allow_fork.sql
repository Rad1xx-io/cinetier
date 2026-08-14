-- CineTier: per-profile control over who may fork a published tier list.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Separate from `is_public` on purpose: publishing decides who can *see* the
-- list, this decides who can take a copy of it. People reasonably want the first
-- without the second.
--
-- Defaults to true, which is exactly how the app behaved before this column
-- existed — nobody's list changes behaviour until they say so.
--
-- Safe to re-run.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'CineTier: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

alter table public.profiles
  add column if not exists allow_fork boolean not null default true;

-- No RLS change is needed. Forking is a read of already-public rows followed by
-- a write to the forker's own list, so the flag is a UI-level courtesy, not an
-- access control: anyone who can see a published list can already copy what is
-- on their screen. It is enforced where it can be — in the client — and the
-- existing owner-only write policies remain the actual security boundary.
