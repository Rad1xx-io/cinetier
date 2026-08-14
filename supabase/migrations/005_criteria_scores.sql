-- CineTier: per-criterion breakdown for a rated title.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- One row per criterion, keyed to the ranked_titles row it belongs to. Deleting
-- a rating takes its breakdown with it, so nothing is left pointing at a title
-- the user no longer ranks.
--
-- Safe to re-run. If an earlier attempt left a half-built table behind, the
-- guard below clears it before the real definition lands.

-- Prerequisites, named explicitly: a missing table further down produces an
-- error about a column or a relation, which says nothing about what to run first.
do $$
begin
  if to_regclass('public.ranked_titles') is null then
    raise exception 'CineTier: run supabase/schema.sql first — public.ranked_titles is missing.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'CineTier: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

-- A leftover from a failed run is empty by definition: the app has never been
-- able to write here, because that is what the failed run was for. Dropping only
-- an empty table means a rebuild can never cost data, while a table that does
-- hold rows is left untouched for a human to look at.
do $$
begin
  if to_regclass('public.criteria_scores') is not null
     and not exists (select 1 from public.criteria_scores limit 1) then
    drop table public.criteria_scores cascade;
  end if;
end $$;

create table if not exists public.criteria_scores (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.ranked_titles (id) on delete cascade,
  -- Denormalised so the RLS policies below can check ownership without a join
  -- on every row, and so a stray row can never be attributed to another user.
  user_id uuid not null references auth.users (id) on delete cascade,
  criterion_id text not null,
  name text not null,
  score real not null check (score >= 1 and score <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One score per criterion per rating; re-saving updates rather than
  -- duplicates. The client's upsert names these two columns as its conflict
  -- target, so this constraint is what makes saving work at all.
  unique (rating_id, criterion_id)
);

create index if not exists criteria_scores_rating_id_idx on public.criteria_scores (rating_id);
create index if not exists criteria_scores_user_id_idx on public.criteria_scores (user_id);

alter table public.criteria_scores enable row level security;

drop policy if exists "Users can view their own criteria" on public.criteria_scores;
create policy "Users can view their own criteria"
  on public.criteria_scores for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own criteria" on public.criteria_scores;
create policy "Users can insert their own criteria"
  on public.criteria_scores for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own criteria" on public.criteria_scores;
create policy "Users can update their own criteria"
  on public.criteria_scores for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own criteria" on public.criteria_scores;
create policy "Users can delete their own criteria"
  on public.criteria_scores for delete
  using (auth.uid() = user_id);

-- Published lists expose their breakdown too, on the same opt-in terms as the
-- ratings themselves: visible only while the owner keeps a public profile.
drop policy if exists "Published criteria are publicly readable" on public.criteria_scores;
create policy "Published criteria are publicly readable"
  on public.criteria_scores for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = criteria_scores.user_id and p.is_public
    )
  );
