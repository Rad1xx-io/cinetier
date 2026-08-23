-- TierListOnline: custom tier lists — boards built from photos the owner uploads.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- READ THIS BEFORE RUNNING. This is the first feature that accepts files from
-- people, and so the first that can carry something nobody here chose to
-- publish. Three things follow, and all three are enforced below rather than in
-- the app:
--
--   * `is_public` decides who may open a list by its link. It does NOT decide
--     whether search engines see it — these pages are served `noindex` and stay
--     out of the sitemap whatever the owner picks. Handing user photographs to
--     an index before any automatic moderation exists is a different order of
--     risk from merely hosting them.
--   * `hidden_at` on a list or a card takes it out of every read path at once,
--     including the signed urls its pictures are served through. It is the
--     takedown switch, usable from here with one update.
--   * The bucket is private. A cover is reachable only through a short-lived
--     signed url, issued only for content the reader is allowed to see — so
--     hiding something actually stops it being served, rather than leaving a
--     public url alive until somebody remembers to delete the file.
--
-- Safe to re-run.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

-- ---------------------------------------------------------------- the list --

create table if not exists public.custom_tier_lists (
  id uuid primary key default gen_random_uuid(),
  -- References auth.users, not profiles: a custom list needs an account, but it
  -- does not need a published handle the way a feed post does.
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  -- Who may open the link. See the note above about what this is not.
  is_public boolean not null default true,
  -- Set to take the whole list out of circulation. Owner or operator.
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_lists_user_idx
  on public.custom_tier_lists (user_id, updated_at desc);

-- ------------------------------------------------------------------ a tier --

create table if not exists public.custom_tier_rows (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.custom_tier_lists (id) on delete cascade,
  -- Deliberately not unique with list_id: reordering rewrites several positions
  -- at once, and a unique index would reject the intermediate state.
  position integer not null default 0 check (position >= 0),
  -- The whole point of a custom board: a tier can be "Best game of 2026"
  -- instead of "S". Short, because it renders in a narrow column.
  label text not null check (char_length(trim(label)) between 1 and 40),
  color text not null default '#f59e0b' check (color ~ '^#[0-9a-f]{6}$'),
  -- A tier may show a picture instead of a letter. Path within the bucket.
  image_path text check (char_length(image_path) between 1 and 400),
  created_at timestamptz not null default now()
);

create index if not exists custom_rows_list_idx
  on public.custom_tier_rows (list_id, position);

-- ------------------------------------------------------------------ a card --

create table if not exists public.custom_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.custom_tier_lists (id) on delete cascade,
  -- Null means the unassigned pool under the board. `on delete set null` so
  -- deleting a tier returns its cards to the pool instead of destroying them.
  row_id uuid references public.custom_tier_rows (id) on delete set null,
  position integer not null default 0 check (position >= 0),
  caption text not null default '' check (char_length(caption) <= 120),
  image_path text not null check (char_length(image_path) between 1 and 400),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists custom_items_list_idx
  on public.custom_items (list_id, row_id, position);

-- ---------------------------------------------------------------- reports ---

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  -- Kept if the reporter later deletes their account: the report is still worth
  -- reading, and losing it would reward deleting the account.
  reporter_id uuid references auth.users (id) on delete set null,
  subject_type text not null check (subject_type in ('custom_item', 'custom_list')),
  subject_id uuid not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at desc);
create index if not exists content_reports_subject_idx
  on public.content_reports (subject_type, subject_id);

-- ----------------------------------------------------------- upload ledger --

-- One row per accepted file. Carries the daily quota, and doubles as the record
-- of what was uploaded when — which is what a takedown works from.
create table if not exists public.custom_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  image_path text not null check (char_length(image_path) between 1 and 400),
  byte_size integer not null check (byte_size > 0),
  content_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists custom_uploads_user_day_idx
  on public.custom_uploads (user_id, created_at desc);

-- -------------------------------------------------------------------- RLS --

alter table public.custom_tier_lists enable row level security;
alter table public.custom_tier_rows enable row level security;
alter table public.custom_items enable row level security;
alter table public.content_reports enable row level security;
alter table public.custom_uploads enable row level security;

drop policy if exists "Custom lists are readable by link" on public.custom_tier_lists;
create policy "Custom lists are readable by link"
  on public.custom_tier_lists for select
  using ((is_public and hidden_at is null) or auth.uid() = user_id);

drop policy if exists "Owners create their own custom lists" on public.custom_tier_lists;
create policy "Owners create their own custom lists"
  on public.custom_tier_lists for insert
  with check (auth.uid() = user_id);

drop policy if exists "Owners update their own custom lists" on public.custom_tier_lists;
create policy "Owners update their own custom lists"
  on public.custom_tier_lists for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners delete their own custom lists" on public.custom_tier_lists;
create policy "Owners delete their own custom lists"
  on public.custom_tier_lists for delete
  using (auth.uid() = user_id);

-- Tiers and cards inherit their list's visibility rather than restating it, so
-- hiding a list cannot leave its contents readable through another table.
drop policy if exists "Custom tiers follow their list" on public.custom_tier_rows;
create policy "Custom tiers follow their list"
  on public.custom_tier_rows for select
  using (exists (
    select 1 from public.custom_tier_lists l
    where l.id = list_id and ((l.is_public and l.hidden_at is null) or auth.uid() = l.user_id)
  ));

drop policy if exists "Owners write their own custom tiers" on public.custom_tier_rows;
create policy "Owners write their own custom tiers"
  on public.custom_tier_rows for all
  using (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ))
  with check (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

drop policy if exists "Custom cards follow their list" on public.custom_items;
create policy "Custom cards follow their list"
  on public.custom_items for select
  using (
    exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id and auth.uid() = l.user_id
    )
    or (
      hidden_at is null
      and exists (
        select 1 from public.custom_tier_lists l
        where l.id = list_id and l.is_public and l.hidden_at is null
      )
    )
  );

drop policy if exists "Owners write their own custom cards" on public.custom_items;
create policy "Owners write their own custom cards"
  on public.custom_items for all
  using (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ))
  with check (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

-- Anyone signed in may report. Nobody may read reports through the API: there
-- is no select policy on purpose, so they are answerable only from here.
drop policy if exists "Signed-in visitors can report content" on public.content_reports;
create policy "Signed-in visitors can report content"
  on public.content_reports for insert
  with check (auth.uid() is not null and auth.uid() = reporter_id);

drop policy if exists "Uploads are visible to their uploader" on public.custom_uploads;
create policy "Uploads are visible to their uploader"
  on public.custom_uploads for select
  using (auth.uid() = user_id);

drop policy if exists "Uploads are recorded by their uploader" on public.custom_uploads;
create policy "Uploads are recorded by their uploader"
  on public.custom_uploads for insert
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- storage --

-- Private. Covers are served through short-lived signed urls, which is what
-- makes `hidden_at` mean anything: hide the card and the next url is never
-- issued, rather than a public url outliving the decision.
insert into storage.buckets (id, name, public)
values ('custom-uploads', 'custom-uploads', false)
on conflict (id) do update set public = false;

-- Files live under {user_id}/..., so ownership is the first path segment.
drop policy if exists "Owners upload into their own folder" on storage.objects;
create policy "Owners upload into their own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'custom-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owners manage their own files" on storage.objects;
create policy "Owners manage their own files"
  on storage.objects for all
  using (
    bucket_id = 'custom-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'custom-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A reader may sign a url only for a picture actually on show: a card or a tier
-- of a list they may open, and not hidden.
drop policy if exists "Covers of visible lists can be read" on storage.objects;
create policy "Covers of visible lists can be read"
  on storage.objects for select
  using (
    bucket_id = 'custom-uploads'
    and (
      exists (
        select 1
        from public.custom_items i
        join public.custom_tier_lists l on l.id = i.list_id
        where i.image_path = storage.objects.name
          and i.hidden_at is null
          and l.hidden_at is null
          and (l.is_public or auth.uid() = l.user_id)
      )
      or exists (
        select 1
        from public.custom_tier_rows r
        join public.custom_tier_lists l on l.id = r.list_id
        where r.image_path = storage.objects.name
          and l.hidden_at is null
          and (l.is_public or auth.uid() = l.user_id)
      )
    )
  );

-- ------------------------------------------------------------- operations --
--
-- Take one picture down, keeping the record of it:
--   update public.custom_items set hidden_at = now() where id = '<item id>';
--
-- Take a whole list down:
--   update public.custom_tier_lists set hidden_at = now() where id = '<list id>';
--
-- Read the open reports with what they point at:
--   select r.id, r.reason, r.created_at, r.reporter_id,
--          i.image_path, i.caption, l.id as list_id, l.title, l.user_id
--   from public.content_reports r
--   left join public.custom_items i
--          on r.subject_type = 'custom_item' and i.id = r.subject_id
--   left join public.custom_tier_lists l
--          on l.id = coalesce(i.list_id, r.subject_id)
--   where r.status = 'open'
--   order by r.created_at desc;
--
-- Delete the file once a decision is final (hiding stops it being served; this
-- removes it):
--   delete from storage.objects
--   where bucket_id = 'custom-uploads' and name = '<image_path>';
