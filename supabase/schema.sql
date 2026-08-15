-- TierListOnline cloud sync schema.
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- Mirrors lib/types/index.ts RankedTitle. One row per (user, tmdb title).

create table if not exists public.ranked_titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id bigint not null,
  media_type text not null check (media_type in ('movie', 'tv', 'anime', 'game')),
  title text not null,
  poster_path text,
  release_date text,
  tier text not null check (tier in ('S', 'A', 'B', 'C', 'D', 'F', 'Unrated')),
  "order" integer not null default 0,
  vote_average real,
  added_at bigint not null,
  updated_at bigint not null,
  unique (user_id, tmdb_id, media_type)
);

create index if not exists ranked_titles_user_id_idx on public.ranked_titles (user_id);

alter table public.ranked_titles enable row level security;

-- Each user can only ever see/change their own rows.
create policy "Users can view their own ranked titles"
  on public.ranked_titles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own ranked titles"
  on public.ranked_titles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own ranked titles"
  on public.ranked_titles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own ranked titles"
  on public.ranked_titles for delete
  using (auth.uid() = user_id);

-- YouTube channels — a separate, independent category. Mirrors lib/types/youtube.ts RankedChannel.

create table if not exists public.ranked_channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id text not null,
  title text not null,
  thumbnail_url text,
  country text,
  tier text not null check (tier in ('S', 'A', 'B', 'C', 'D', 'F', 'Unrated')),
  "order" integer not null default 0,
  subscriber_count bigint,
  added_at bigint not null,
  updated_at bigint not null,
  unique (user_id, channel_id)
);

create index if not exists ranked_channels_user_id_idx on public.ranked_channels (user_id);

alter table public.ranked_channels enable row level security;

create policy "Users can view their own ranked channels"
  on public.ranked_channels for select
  using (auth.uid() = user_id);

create policy "Users can insert their own ranked channels"
  on public.ranked_channels for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own ranked channels"
  on public.ranked_channels for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own ranked channels"
  on public.ranked_channels for delete
  using (auth.uid() = user_id);
