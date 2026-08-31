-- TierListOnline: custom tier lists — boards built from photos the owner uploads.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- READ THIS BEFORE RUNNING. This is the first feature that accepts files from
-- people, and so the first that can carry something nobody here chose to
-- publish. Four things follow, and all four are enforced here rather than in
-- the app, because anything the app enforces can be skipped by not using it.
--
--   * `is_public` decides who may open a list by its link. It does NOT decide
--     whether search engines see it — these pages are served `noindex` and stay
--     out of the sitemap whatever the owner picks.
--   * `hidden_at` is the OWNER's switch: their own "not right now". It is not a
--     moderation tool and must never be mistaken for one, because the owner can
--     always set it back.
--   * `content_moderation` is the OPERATOR's switch, and the owner cannot write
--     it, read it, or undo it through any API. A blocked list or card is gone
--     from every read path, including the signed urls that serve its pictures.
--   * A file cannot enter the bucket unless a grant was issued for that exact
--     path first, and grants are only minted by a function that checks who is
--     asking, what they already hold, and whether they ticked the rights box.
--     Uploading straight from a browser, skipping the app's route, gets a
--     row-level security failure rather than a stored file.
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
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  is_public boolean not null default true,
  -- The owner's own switch. See the header: this is not moderation.
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
  label text not null check (char_length(trim(label)) between 1 and 40),
  color text not null default '#f59e0b' check (color ~ '^#[0-9a-f]{6}$'),
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

-- ------------------------------------------------------------- moderation ---

-- The operator's switch, kept in its own table for one reason: a column on the
-- content is a column the content's owner can write. Nothing below grants any
-- API role a single privilege on this table — no select, no insert, no update,
-- no delete — so the only way in or out is this editor.
create table if not exists public.content_moderation (
  subject_type text not null check (subject_type in ('custom_item', 'custom_list')),
  subject_id uuid not null,
  blocked_at timestamptz not null default now(),
  note text,
  primary key (subject_type, subject_id)
);

-- ---------------------------------------------------------- upload grants ---

-- Permission to put one file at one path, minted only by the function below.
-- Also the upload ledger: a grant records what was allowed, and its consumption
-- records what arrived, which is what the daily quota counts and what a
-- takedown works from.
create table if not exists public.upload_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  list_id uuid not null references public.custom_tier_lists (id) on delete cascade,
  image_path text not null unique check (char_length(image_path) between 1 and 400),
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists upload_grants_user_day_idx
  on public.upload_grants (user_id, created_at desc);

-- -------------------------------------------------------------- functions ---

-- Whether something has been taken down. Security definer so the check can see
-- a table nothing else may read: a policy's subquery runs as the caller, so an
-- ordinary lookup here would find nothing and every block would be invisible.
-- Returns a boolean and nothing else, so it leaks no moderation detail.
create or replace function public.is_blocked(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.content_moderation m
    where m.subject_type = p_type and m.subject_id = p_id
  );
$$;

revoke all on function public.is_blocked(text, uuid) from public;
grant execute on function public.is_blocked(text, uuid) to anon, authenticated;

-- Whether this exact path was granted to whoever is asking, recently, and is
-- still unused. Security definer for the same reason as above.
create or replace function public.has_upload_grant(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.upload_grants g
    where g.image_path = p_path
      and g.user_id = auth.uid()
      and g.consumed_at is null
      -- A grant is for uploading now, not for keeping.
      and g.created_at > now() - interval '10 minutes'
  );
$$;

revoke all on function public.has_upload_grant(text) from public;
grant execute on function public.has_upload_grant(text) to authenticated;

-- The only way a path becomes writable.
--
-- Every limit that can be checked before the bytes exist is checked here, in
-- the database, where skipping the app's route does not skip it: who owns the
-- board, how many cards it already holds, how many files this person has had
-- today, and whether they answered the rights question.
create or replace function public.issue_upload_grant(
  p_list_id uuid,
  p_rights_confirmed boolean,
  p_extension text,
  p_for_tier boolean default false
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_path text;
begin
  if v_user is null then
    raise exception 'Sign in to upload a picture.' using errcode = '42501';
  end if;

  -- Counting and then inserting is two steps, and two requests arriving
  -- together would both read the same count and both be allowed. One lock per
  -- person, held to the end of the transaction, makes the daily limit a limit
  -- rather than a strong suggestion.
  perform pg_advisory_xact_lock(hashtext(v_user::text));

  if p_rights_confirmed is not true then
    raise exception 'Confirm you have the right to use this image.' using errcode = '22023';
  end if;

  if p_extension not in ('jpg', 'png', 'webp') then
    raise exception 'Images must be JPEG, PNG or WebP.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.custom_tier_lists l
    where l.id = p_list_id and l.user_id = v_user
  ) then
    raise exception 'That board belongs to someone else.' using errcode = '42501';
  end if;

  -- A tier's own picture is not a card, so it does not count against the
  -- board's card limit — but it does count against the daily one.
  if not p_for_tier and (
    select count(*) from public.custom_items i where i.list_id = p_list_id
  ) >= 100 then
    raise exception 'A board holds up to 100 cards.' using errcode = '23505';
  end if;

  if (
    select count(*) from public.upload_grants g
    where g.user_id = v_user and g.created_at > now() - interval '24 hours'
  ) >= 50 then
    raise exception 'That is 50 uploads today — the limit resets tomorrow.' using errcode = '23505';
  end if;

  v_path := v_user::text || '/' || p_list_id::text || '/' || gen_random_uuid()::text || '.' || p_extension;

  insert into public.upload_grants (user_id, list_id, image_path)
  values (v_user, p_list_id, v_path);

  return v_path;
end;
$$;

revoke all on function public.issue_upload_grant(uuid, boolean, text, boolean) from public;
grant execute on function public.issue_upload_grant(uuid, boolean, text, boolean) to authenticated;

-- Turning an uploaded file into something the board shows.
--
-- The size is read from the stored object rather than taken from whoever
-- uploaded it: Storage computes it, so it is the one measurement here that
-- cannot be claimed. Nothing else may create a card, so a file that fails this
-- is never referenced and therefore never served.
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

-- -------------------------------------------------------------------- RLS --

alter table public.custom_tier_lists enable row level security;
alter table public.custom_tier_rows enable row level security;
alter table public.custom_items enable row level security;
alter table public.content_reports enable row level security;
alter table public.content_moderation enable row level security;
alter table public.upload_grants enable row level security;

-- content_moderation and upload_grants deliberately get no policies at all.
-- Row-level security with no policy denies every API role, which is the point:
-- both are reachable only from this editor or through the security-definer
-- functions above.

drop policy if exists "Custom lists are readable by link" on public.custom_tier_lists;
create policy "Custom lists are readable by link"
  on public.custom_tier_lists for select
  using (
    not public.is_blocked('custom_list', id)
    and ((is_public and hidden_at is null) or auth.uid() = user_id)
  );

drop policy if exists "Owners create their own custom lists" on public.custom_tier_lists;
create policy "Owners create their own custom lists"
  on public.custom_tier_lists for insert
  with check (auth.uid() = user_id);

-- A blocked list cannot be edited back into circulation, or the block would
-- last exactly as long as it took its owner to notice.
drop policy if exists "Owners update their own custom lists" on public.custom_tier_lists;
create policy "Owners update their own custom lists"
  on public.custom_tier_lists for update
  using (auth.uid() = user_id and not public.is_blocked('custom_list', id))
  with check (auth.uid() = user_id and not public.is_blocked('custom_list', id));

drop policy if exists "Owners delete their own custom lists" on public.custom_tier_lists;
create policy "Owners delete their own custom lists"
  on public.custom_tier_lists for delete
  using (auth.uid() = user_id and not public.is_blocked('custom_list', id));

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
    not public.is_blocked('custom_item', id)
    and exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id
        and (
          auth.uid() = l.user_id
          -- `custom_items.hidden_at`, qualified. Unqualified it read
          -- `hidden_at is null and l.is_public and l.hidden_at is null`, and
          -- inside a subquery selecting from custom_tier_lists that first
          -- name binds to the LIST, not the card — so the rule checked the
          -- list twice and never checked the card, and a card its owner had
          -- hidden stayed visible to everyone.
          --
          -- Migration 013 already corrects this on any database that has run
          -- it, and 013 remains the migration that fixes deployed installs.
          -- It is corrected *here too* because this file says it is safe to
          -- re-run, and it was not: re-running 012 on a database that had
          -- already had 013 applied silently put the vulnerable policy back,
          -- with no error and nothing to notice. The two definitions are now
          -- identical, so the order they are applied in no longer decides
          -- whether hidden cards stay hidden.
          or (custom_items.hidden_at is null and l.is_public and l.hidden_at is null)
        )
    )
  );

-- No insert policy on purpose: a card is created by attach_upload, which only
-- accepts a file that was granted, uploaded and measured. Letting the owner
-- insert one directly would let them point a card at any path they like.
drop policy if exists "Owners write their own custom cards" on public.custom_items;
drop policy if exists "Owners rearrange their own custom cards" on public.custom_items;
create policy "Owners rearrange their own custom cards"
  on public.custom_items for update
  using (
    not public.is_blocked('custom_item', id)
    and exists (
      select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
    )
  )
  with check (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

drop policy if exists "Owners delete their own custom cards" on public.custom_items;
create policy "Owners delete their own custom cards"
  on public.custom_items for delete
  using (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

drop policy if exists "Signed-in visitors can report content" on public.content_reports;
create policy "Signed-in visitors can report content"
  on public.content_reports for insert
  with check (auth.uid() is not null and auth.uid() = reporter_id);

-- ---------------------------------------------------------------- storage --

insert into storage.buckets (id, name, public)
values ('custom-uploads', 'custom-uploads', false)
on conflict (id) do update set public = false;

-- These two are what the earlier draft of this migration got wrong. A policy
-- that allows writing anywhere under one's own folder makes every check in the
-- upload route optional, because `.storage.upload()` from an ordinary browser
-- client satisfies it just as well as the route does.
drop policy if exists "Owners upload into their own folder" on storage.objects;
drop policy if exists "Owners manage their own files" on storage.objects;

drop policy if exists "Uploads need a grant" on storage.objects;
create policy "Uploads need a grant"
  on storage.objects for insert
  with check (bucket_id = 'custom-uploads' and public.has_upload_grant(name));

-- No update policy at all. Overwriting a granted path is how a checked file
-- would be replaced by an unchecked one at an address already referenced.

drop policy if exists "Owners remove their own files" on storage.objects;
create policy "Owners remove their own files"
  on storage.objects for delete
  using (
    bucket_id = 'custom-uploads'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- A reader may sign a url only for a picture actually on show. The subqueries
-- run as the reader, so the visibility and moderation rules above apply here
-- too, without being restated.
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
      )
      or exists (
        select 1
        from public.custom_tier_rows r
        join public.custom_tier_lists l on l.id = r.list_id
        where r.image_path = storage.objects.name
          and l.hidden_at is null
      )
    )
  );

-- ------------------------------------------------------- what just happened --

-- Checked rather than assumed: the two policies that made the route optional
-- must be gone, and the ones that replace them must exist. Running this
-- migration is therefore also the test that it did what it says.
do $$
declare
  v_bad integer;
  v_good integer;
begin
  select count(*) into v_bad
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('Owners upload into their own folder', 'Owners manage their own files');
  if v_bad > 0 then
    raise exception 'TierListOnline: the folder-wide storage policies are still present — direct uploads would bypass every upload check.';
  end if;

  select count(*) into v_good
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname = 'Uploads need a grant';
  if v_good <> 1 then
    raise exception 'TierListOnline: the grant-based upload policy is missing.';
  end if;

  select count(*) into v_bad
  from pg_policies
  where schemaname = 'public' and tablename in ('content_moderation', 'upload_grants');
  if v_bad > 0 then
    raise exception 'TierListOnline: content_moderation and upload_grants must have no policies — any policy makes them reachable from the API.';
  end if;

  select count(*) into v_bad
  from pg_policies
  where schemaname = 'public' and tablename = 'custom_items' and cmd = 'INSERT';
  if v_bad > 0 then
    raise exception 'TierListOnline: custom_items has an INSERT policy — cards must only be created by attach_upload.';
  end if;

  raise notice 'TierListOnline: custom tier lists installed, and the upload path checks out.';
end $$;

-- ------------------------------------------------------------- operations --
--
-- Take one picture down so its owner cannot put it back:
--   insert into public.content_moderation (subject_type, subject_id, note)
--   values ('custom_item', '<item id>', 'reported: <why>');
--
-- Take a whole board down:
--   insert into public.content_moderation (subject_type, subject_id, note)
--   values ('custom_list', '<list id>', 'reported: <why>');
--
-- Undo a block:
--   delete from public.content_moderation where subject_id = '<id>';
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
-- Delete the file once a decision is final (a block stops it being served;
-- this removes it):
--   delete from storage.objects
--   where bucket_id = 'custom-uploads' and name = '<image_path>';
