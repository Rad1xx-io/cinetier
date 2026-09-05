-- TierListOnline: freezing a regular tier-list post at the moment it is
-- published. Run once in the Supabase SQL Editor. Safe to re-run.
--
-- SUPERSEDED IN PART BY MIGRATION 029 — read that first. The paragraph below
-- explaining why the titles themselves are NOT frozen no longer describes what
-- happens: posts published from now on carry their own copy of the name,
-- poster and release date, so un-ranking a title afterwards edits the board
-- and not the post. The table itself is unchanged — the snapshot is jsonb and
-- simply carries more fields — and posts published before that change keep
-- resolving live exactly as described here, because a snapshot is never
-- rewritten. The reasoning is kept rather than deleted for the same reason as
-- 013's: it records what the replacement had to keep true.
--
-- Mirrors 013's custom_list_publications, for the other kind of post. A post
-- carries no ranking data of its own (009) — it is rendered by re-reading the
-- author's current ranked_titles every time, live, which means editing your
-- board after publishing quietly rewrites every post you have ever made about
-- it. This freezes the SHAPE: which title sat in which tier, in what order, at
-- the moment Publish was pressed.
--
-- It does not freeze the titles themselves — no name, no poster, no release
-- date. Those are catalogue facts, not something anyone here moderates, and
-- ranked_titles already stores them once at add-time and rarely touches them
-- again, so resolving them live costs nothing and loses nothing. What is
-- catalogue data is resolved live for the same reason a custom board's
-- pictures are: a title the author has since un-ranked simply is not found at
-- render time and drops out of the post, the same way a taken-down custom card
-- does — not because this table tracks moderation, but because the join has
-- nothing to find. `ranked_titles` already gates a stranger's read on the
-- author's own `is_public` flag (004), so that channel for taking a whole
-- board down was already there; this does not add a second one.
--
-- This is a fix for publications made from here on. Posts published before
-- this migration have no row here and keep rendering live until their author
-- deletes and republishes them — nothing here reaches back to touch them.
--
-- No UPDATE policy, on purpose, same as 013: "frozen" is a property of the
-- database, not a promise the app happens to keep, and the self-check at the
-- bottom fails the migration if anyone adds one back.

do $$
begin
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing.';
  end if;
end $$;

-- --------------------------------------------------------- the snapshot ----

create table if not exists public.ranked_title_publications (
  -- One per post, same reasoning as 013: the post is what the feed already
  -- knows how to like, comment on and count views for.
  post_id uuid primary key references public.posts (id) on delete cascade,
  published_at timestamptz not null default now(),
  /*
   * { "titles": [{ "tmdbId", "mediaType", "tier", "order" }, ...] }
   *
   * Identity and placement only. No title, no poster path, no release date —
   * see the header for why resolving those live is the point, not a gap.
   */
  snapshot jsonb not null
);

alter table public.ranked_title_publications enable row level security;

-- ------------------------------------------------------------ who may ------

-- Content-free: a tmdb id, a media type, a tier and a position name nothing a
-- stranger could not already see on the catalogue page itself. The actual
-- title/poster/name still goes through ranked_titles' own is_public gate when
-- the post is rendered, so a public snapshot table leaks nothing extra.
drop policy if exists "Snapshots are publicly readable" on public.ranked_title_publications;
create policy "Snapshots are publicly readable"
  on public.ranked_title_publications for select using (true);

-- Only the post's own author may publish a snapshot of it.
drop policy if exists "Authors publish a snapshot of their own post" on public.ranked_title_publications;
create policy "Authors publish a snapshot of their own post"
  on public.ranked_title_publications for insert
  with check (
    exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- Unpublishing is deleting the post, which cascades to here; this covers the
-- snapshot being withdrawn on its own, the same as 013.
drop policy if exists "Authors withdraw their own snapshot" on public.ranked_title_publications;
create policy "Authors withdraw their own snapshot"
  on public.ranked_title_publications for delete
  using (
    exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- No update policy. See the header and the self-check below.

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_updatable boolean;
begin
  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ranked_title_publications'
      and cmd in ('UPDATE', 'ALL')
  ) into v_updatable;

  if v_updatable then
    raise exception 'TierListOnline: a snapshot must not be updatable — remove that policy.';
  end if;

  raise notice 'TierListOnline: ranked-title publishing installed, and snapshots are frozen.';
end $$;
