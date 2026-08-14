-- CineTier: Taste Battles.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- READ THIS BEFORE RUNNING. A battle is a public link by design: anyone holding
-- the id can read the item pool and submit a set of ratings, with or without an
-- account. That is narrower than it sounds — a battle row carries only the
-- frozen snapshot the creator chose to put in it, never their tier list — but it
-- does open one write path to anonymous visitors (see the insert policy below).
--
-- Safe to re-run. If an earlier attempt left half-built tables behind, the
-- guard below clears them before the real definitions land.

-- Dropped only while empty, so a rebuild can never cost data. Participants go
-- first: the child table's foreign key would block dropping the parent.
do $$
begin
  if to_regclass('public.battle_participants') is not null
     and not exists (select 1 from public.battle_participants limit 1) then
    drop table public.battle_participants cascade;
  end if;
  if to_regclass('public.battles') is not null
     and not exists (select 1 from public.battles limit 1) then
    drop table public.battles cascade;
  end if;
end $$;

create table if not exists public.battles (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('cinema', 'anime', 'games')),
  -- Frozen snapshots, not references: a battle must still render after the
  -- creator edits or deletes the titles it was built from.
  items jsonb not null,
  creator_ratings jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists battles_creator_idx on public.battles (creator_id, created_at desc);

create table if not exists public.battle_participants (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles (id) on delete cascade,
  -- Null for guests. `on delete set null` keeps the creator's results intact
  -- when a participant later deletes their account.
  user_id uuid references auth.users (id) on delete set null,
  ratings jsonb not null,
  -- Recomputed server-side would be better, but the score is derived from the
  -- ratings stored alongside it, so a forged value is detectable and affects
  -- nobody else's data.
  match_score integer not null check (match_score between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists battle_participants_battle_idx
  on public.battle_participants (battle_id, created_at desc);

alter table public.battles enable row level security;
alter table public.battle_participants enable row level security;

-- The link is the invitation: resolving a battle happens before, and usually
-- without, a session. Knowing the uuid is the access check.
drop policy if exists "Battles are readable by link" on public.battles;
create policy "Battles are readable by link"
  on public.battles for select
  using (true);

drop policy if exists "Users can create their own battles" on public.battles;
create policy "Users can create their own battles"
  on public.battles for insert
  with check (auth.uid() = creator_id);

drop policy if exists "Users can delete their own battles" on public.battles;
create policy "Users can delete their own battles"
  on public.battles for delete
  using (auth.uid() = creator_id);

-- Anonymous participation is the feature, so this insert is open to anyone with
-- a valid battle id. The blast radius is bounded: the check forbids claiming
-- someone else's user_id, rows are append-only, and a flood of junk entries
-- pollutes one battle's results rather than touching any user's own data. If
-- abuse ever shows up, rate-limit it here rather than closing the door.
drop policy if exists "Anyone with the link can submit a result" on public.battle_participants;
create policy "Anyone with the link can submit a result"
  on public.battle_participants for insert
  with check (
    (user_id is null or auth.uid() = user_id)
    and exists (select 1 from public.battles b where b.id = battle_id)
  );

-- Results are readable by the person who built the battle and by whoever
-- submitted them. Deliberately not public: the client already has its own
-- comparison in hand after submitting, so nothing needs a wider read than this.
drop policy if exists "Creators and participants can read results" on public.battle_participants;
create policy "Creators and participants can read results"
  on public.battle_participants for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.battles b
      where b.id = battle_participants.battle_id and b.creator_id = auth.uid()
    )
  );
