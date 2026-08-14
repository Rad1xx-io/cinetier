-- CineTier: community feed — posts about a tier list, with likes and comments.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- READ THIS BEFORE RUNNING. A post is public by design: title, description and
-- the author's handle are readable by anyone, signed in or not. The post carries
-- no ranking data of its own — it points at a profile, and what a visitor can
-- see of that profile is still governed by the owner's `is_public` flag from
-- migration 004. Publishing a post does not publish a private list.
--
-- Safe to re-run.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'CineTier: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  -- References the profile rather than auth.users: a post is always shown with
  -- its author's handle, and a post whose profile is gone has nothing to render.
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null
    check (category in ('movie', 'tv', 'anime', 'game', 'youtube', 'mixed')),
  -- Denormalised counter rather than a row per view: nobody needs to know *who*
  -- looked, only how many did, and a table of view rows would dwarf every other
  -- table here within a week.
  views_count integer not null default 0 check (views_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_user_idx on public.posts (user_id, created_at desc);
create index if not exists posts_category_idx on public.posts (category, created_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One like per person per post; the primary key is the rule, so a double tap
  -- cannot produce a second row even if the client asks twice.
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- The feed is the point: everything in it is readable without a session.
drop policy if exists "Posts are publicly readable" on public.posts;
create policy "Posts are publicly readable"
  on public.posts for select using (true);

drop policy if exists "Likes are publicly readable" on public.post_likes;
create policy "Likes are publicly readable"
  on public.post_likes for select using (true);

drop policy if exists "Comments are publicly readable" on public.post_comments;
create policy "Comments are publicly readable"
  on public.post_comments for select using (true);

-- Writing requires an account, and only ever on your own behalf. `auth.uid() =
-- user_id` is what stops one account posting, liking or commenting as another.
drop policy if exists "Users can publish their own posts" on public.posts;
create policy "Users can publish their own posts"
  on public.posts for insert with check (auth.uid() = user_id);

drop policy if exists "Users can edit their own posts" on public.posts;
create policy "Users can edit their own posts"
  on public.posts for update
  using (auth.uid() = user_id)
  -- Without this the owner could raise their own view counter at will; the RPC
  -- below is the only sanctioned way that column moves.
  with check (auth.uid() = user_id and views_count = (select p.views_count from public.posts p where p.id = posts.id));

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete using (auth.uid() = user_id);

drop policy if exists "Users can like as themselves" on public.post_likes;
create policy "Users can like as themselves"
  on public.post_likes for insert with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own like" on public.post_likes;
create policy "Users can remove their own like"
  on public.post_likes for delete using (auth.uid() = user_id);

drop policy if exists "Users can comment as themselves" on public.post_comments;
create policy "Users can comment as themselves"
  on public.post_comments for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own comments" on public.post_comments;
create policy "Users can delete their own comments"
  on public.post_comments for delete using (auth.uid() = user_id);

-- Post authors may also clear a comment from under their own post. Moderating
-- your own thread is the minimum a public comment box needs.
drop policy if exists "Post authors can remove comments on their post" on public.post_comments;
create policy "Post authors can remove comments on their post"
  on public.post_comments for delete
  using (
    exists (
      select 1 from public.posts p
      where p.id = post_comments.post_id and p.user_id = auth.uid()
    )
  );

/*
 * Views are counted through this function rather than an UPDATE policy.
 *
 * Letting any visitor UPDATE the row to bump a counter would let them write
 * anything else on it too, and the counter has to move for people who are not
 * signed in at all. SECURITY DEFINER narrows that to exactly one statement
 * touching exactly one column.
 */
create or replace function public.increment_post_views(p_post_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.posts set views_count = views_count + 1 where id = p_post_id;
$$;

revoke all on function public.increment_post_views(uuid) from public;
grant execute on function public.increment_post_views(uuid) to anon, authenticated;

/*
 * What the feed actually reads: one row per post, already carrying its author's
 * handle and its tallies. Counting likes and comments in the client would mean
 * a query per card.
 *
 * `security_invoker` keeps the caller's RLS in force rather than the view
 * owner's — the policies above stay the boundary, the view is only a shape.
 */
create or replace view public.post_feed
with (security_invoker = true) as
select
  p.id,
  p.user_id,
  p.title,
  p.description,
  p.category,
  p.views_count,
  p.created_at,
  pr.username,
  pr.display_name,
  pr.is_public,
  pr.allow_fork,
  (select count(*) from public.post_likes l where l.post_id = p.id) as likes_count,
  (select count(*) from public.post_comments c where c.post_id = p.id) as comments_count
from public.posts p
join public.profiles pr on pr.id = p.user_id;

grant select on public.post_feed to anon, authenticated;
