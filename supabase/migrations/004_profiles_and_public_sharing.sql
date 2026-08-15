-- TierListOnline: public profiles and shareable tier lists.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- READ THIS BEFORE RUNNING. Sharing a tier list means the ranked rows behind it
-- become readable by anyone who knows the username — including visitors with no
-- account. That is the entire point of /u/<username>, but it is a real change in
-- who can read your data, so it is opt-in per user: nothing is exposed until a
-- profile row exists with is_public = true. Deleting the profile row, or setting
-- is_public to false, closes the door again immediately.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Lowercase, 3-20 chars, letters/digits/underscore/dash only. Enforced here as
  -- well as in the UI so a direct API call cannot slip a stray value through.
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9_-]{3,20}$'),
  display_name text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (username);

alter table public.profiles enable row level security;

-- Anyone may look up a profile: resolving /u/<username> happens before (and
-- usually without) a session.
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can delete their own profile" on public.profiles;
create policy "Users can delete their own profile"
  on public.profiles for delete
  using (auth.uid() = id);

-- Public read of the rankings themselves, and only for owners who published a
-- profile. The existing owner-only policies stay exactly as they were; this adds
-- a second, narrower way in. Writes remain owner-only.
drop policy if exists "Published tier lists are publicly readable" on public.ranked_titles;
create policy "Published tier lists are publicly readable"
  on public.ranked_titles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = ranked_titles.user_id and p.is_public
    )
  );

drop policy if exists "Published channel lists are publicly readable" on public.ranked_channels;
create policy "Published channel lists are publicly readable"
  on public.ranked_channels for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = ranked_channels.user_id and p.is_public
    )
  );
