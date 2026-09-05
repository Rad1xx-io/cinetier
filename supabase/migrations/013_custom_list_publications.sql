-- TierListOnline: publishing a custom board to the feed.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- SUPERSEDED IN PART BY MIGRATION 029 — read that first. The paragraph below
-- describing pictures as live is no longer how this works: a published post
-- keeps the picture it was published with, because a post should behave like a
-- post. What 029 did NOT change is the requirement the paragraph is really
-- about — moderation still reaches a published post — and it reaches it by
-- keeping the card's row alive rather than by re-resolving it. The reasoning
-- is kept here rather than deleted because it explains what any replacement
-- has to preserve.
--
-- A publication freezes the SHAPE of a board and nothing else. The snapshot
-- holds which cards were in which tier, in what order, under what captions, at
-- the moment Publish was pressed. It holds no file paths and copies no
-- pictures.
--
-- Everything visual is resolved live, from the cards themselves, every time
-- the post is rendered. That is not an optimisation — it is what makes a
-- takedown work. A card that gets blocked, hidden by its owner, or deleted
-- stops appearing in the post immediately, because the post never had its own
-- copy to fall back on. The frozen part cannot outlive the moderated part.
--
-- It also repairs a card visibility rule from 012 that never checked the card —
-- see the note further down, since publishing depends on it.
--
-- There is deliberately no UPDATE policy below. "Frozen" is then a property of
-- the database rather than a promise made by the app, and the update-snapshot
-- button that does not exist yet cannot be built by accident.

do $$
begin
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing.';
  end if;
  if to_regclass('public.custom_tier_lists') is null then
    raise exception 'TierListOnline: run migration 012 first — custom boards are missing.';
  end if;
end $$;

-- ------------------------------------------------------- a new post kind ---

-- The feed's categories were the five catalogues plus "mixed". A board of
-- somebody's own photographs is none of those.
alter table public.posts drop constraint if exists posts_category_check;
alter table public.posts add constraint posts_category_check
  check (category in ('movie', 'tv', 'anime', 'game', 'youtube', 'mixed', 'custom'));

-- --------------------------------------------------------- the snapshot ----

create table if not exists public.custom_list_publications (
  -- One publication per post, and the post is what the feed already knows how
  -- to like, comment on and count views for.
  post_id uuid primary key references public.posts (id) on delete cascade,
  list_id uuid not null references public.custom_tier_lists (id) on delete cascade,
  published_at timestamptz not null default now(),
  /*
   * The shape, as it stood. Rows carry id, label, colour and position; cards
   * carry id, the row they sat in, position and caption. No image paths: a
   * card's picture is looked up from the live card when the post is rendered,
   * so a card that has since been hidden, blocked or deleted has nothing here
   * to render from.
   */
  snapshot jsonb not null
);

create index if not exists custom_publications_list_idx
  on public.custom_list_publications (list_id, published_at desc);

alter table public.custom_list_publications enable row level security;

-- ------------------------------------------------------------ who may ------

-- Readable alongside the post it belongs to, except where the board itself has
-- gone. `custom_tier_lists` has its own row-level security, so a private board
-- is already invisible here to everybody but its owner — this only adds the
-- two states that hide a board that is otherwise public.
drop policy if exists "Publications are readable" on public.custom_list_publications;
create policy "Publications are readable"
  on public.custom_list_publications for select
  using (
    not public.is_blocked('custom_list', list_id)
    and exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id and l.hidden_at is null
    )
  );

-- Only the board's owner may publish it, and only their own board.
drop policy if exists "Owners publish their own boards" on public.custom_list_publications;
create policy "Owners publish their own boards"
  on public.custom_list_publications for insert
  with check (
    exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

-- Unpublishing is deleting the post, which cascades to here; this covers the
-- publication being removed on its own.
drop policy if exists "Owners withdraw their own publications" on public.custom_list_publications;
create policy "Owners withdraw their own publications"
  on public.custom_list_publications for delete
  using (
    exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

-- No update policy, on purpose. See the header.

-- ------------------------------------------- what "hidden" has to mean ----

/*
 * Corrects the card visibility rule, which this feature leans on.
 *
 * As written in 012 the clause read `hidden_at is null and l.is_public and
 * l.hidden_at is null`, and that first `hidden_at` is unqualified inside a
 * subquery selecting from custom_tier_lists — so Postgres bound it to the
 * list, not the card. The rule therefore checked the list twice and never
 * checked the card at all, and a card its owner had hidden stayed visible to
 * everyone.
 *
 * That was already wrong. It becomes load-bearing here: a published post
 * renders its cards by looking them up live, so "hide this card" only reaches
 * the post if hiding actually hides.
 */
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
          or (custom_items.hidden_at is null and l.is_public and l.hidden_at is null)
        )
    )
  );

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_updatable boolean;
begin
  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'custom_list_publications'
      and cmd in ('UPDATE', 'ALL')
  ) into v_updatable;

  if v_updatable then
    raise exception 'TierListOnline: a snapshot must not be updatable — remove that policy.';
  end if;

  raise notice 'TierListOnline: custom board publishing installed, and snapshots are frozen.';
end $$;
