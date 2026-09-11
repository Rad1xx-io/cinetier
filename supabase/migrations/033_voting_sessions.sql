-- TierListOnline: group voting on a frozen pool of titles.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. Decisions behind this file, and where each one
-- came from, are in .ai/PLAN-group-voting.md (the open questions) and the
-- 2026-09-11 DECISIONS.md entry that answers them. Restated here only where
-- the schema itself depends on the answer.
--
-- WHAT A SESSION IS, SHAPE-WISE. Not a new kind of list, and not a mode on an
-- existing one — a room, the same shape as `battles`/`battle_participants`
-- (006): a creator freezes a pool, anyone with the link can submit a ballot,
-- with or without an account. `voting_sessions` plays the part `battles`
-- plays; `voting_ballots` plays the part `battle_participants` plays. That
-- precedent is why this is a new pair of tables and not an extension of
-- `posts`/`ranked_title_publications` — those are immutable by construction
-- (no UPDATE policy anywhere, self-checked) and single-author, and a session
-- is neither of those things until it closes.
--
-- WHAT IS DELIBERATELY OUT, per the decisions already made — not omissions:
--   * Custom boards cannot seed a pool. Two independent reasons, either one
--     sufficient on its own: the Fork-for-custom decision (.ai/DECISIONS.md,
--     2026-09-02) already treats someone else's uploaded photos as needing
--     its own answer, not a borrowed one; and a custom card's picture
--     resolves live (029) — an open session over a custom board could show
--     different voters a different pool mid-vote, which nothing here
--     accounts for. Titles only: movie/tv/anime/game, the same identity
--     space `ranked_titles` already uses.
--   * One privacy mode: a public link. No invite list, no password.
--   * No live leaderboard, no Realtime, no polling. A session is open or
--     closed; nothing about its state is pushed anywhere.
--   * No anti-abuse beyond one ballot per browser (below). Battle's own
--     header states its own bar plainly: "If abuse ever shows up, rate-limit
--     it here rather than closing the door." Voting starts at one step past
--     that bar, not several.
--
-- THE TRUST MODEL FOR ANONYMOUS BALLOTS, AND HOW IT DIFFERS FROM BATTLE'S.
-- Battle is the only existing place anon can write to this database at all
-- (found while planning this, corrected in the same pass it was found in —
-- see .ai/PLAN-group-voting.md) — and its own append-only, bounded-blast-
-- radius reasoning is reused here. What does NOT carry over unchanged: a
-- battle's result is private (read by its creator and the participant who
-- made it), so one person submitting twice from two browsers costs nobody
-- but themself. A voting session's result is the whole point, and it is
-- everybody's the moment the session closes — the stakes for "one person,
-- many ballots" are real here in a way they are not for Battle. The answer
-- is not a stronger identity check (no accounts required, per the decision
-- above) but a narrower one: one ballot per (session, voter_key), where
-- voter_key is an opaque id the client mints once and keeps in storage —
-- exactly the browser-only, not-a-person check Battle's own header already
-- named as the honest ceiling of what a public link can enforce ("if abuse
-- ever shows up, rate-limit it here"), moved one notch, not reinvented.
-- Bypassing it (private browsing, a second browser, clearing storage) costs
-- exactly what Battle's own bypass already costs — nothing this migration
-- claims to prevent.
--
-- WHY voting_ballots HAS NO SELECT POLICY AT ALL, UNLIKE battle_participants.
-- Battle lets its creator read every participant's row, because Battle's own
-- result IS that per-participant comparison. A vote's whole promise (see the
-- decisions above: no live leaderboard) is that nobody sees anything until
-- the room closes — not the creator, not other voters. The closing function
-- below is SECURITY DEFINER, so it can read every ballot to aggregate them
-- without any SELECT policy existing for ordinary clients at all. A client
-- asking "did I already vote" is answered by attempting an insert and
-- reading the unique-violation, not by a read it is not granted.
--
-- WHY CLOSING IS ONE RPC, NOT CLIENT-ORCHESTRATED LIKE publishPost.
-- `publishPost` is two sequential client inserts with a manual compensating
-- delete if the second fails — fine there, because only its own author is
-- racing itself. Closing a session reads every ballot and must produce
-- exactly one result; doing that as client-side reads-then-writes would let
-- two closers (say, two tabs) race, or a ballot land between the read and
-- the write and vanish from the count. SECURITY DEFINER and one statement
-- of PL/pgSQL make the read-aggregate-write one atomic unit instead.
--
-- HOW A TIE IN THE AGGREGATION IS BROKEN, spelled out here because the
-- reasoning belongs next to the schema it protects, not only in the report
-- that shipped it. The rule is "the tier with the most votes wins" first —
-- a tie only needs breaking between tiers that are *already* tied for the
-- most votes on one item. Rather than picking a fixed direction (always
-- round up, always round down — either would be an opinion applied whether
-- or not it fits what actually happened), the break uses more of what the
-- room actually said: whichever of the tied tiers sits closer to the mean
-- tier position across every vote cast for that item, tied tiers included.
-- Two tiers next to each other splitting a vote resolves toward whichever
-- one the *rest* of the room leaned toward; two tiers far apart splitting a
-- vote (a genuinely polarising item — some tier it S, others F, nothing in
-- between) resolves toward whichever of the two is closer to the room's
-- actual center of gravity, not toward an arbitrary side. Only when the mean
-- itself sits exactly as far from both tied tiers — the fully symmetric
-- case, e.g. a pure 50/50 S-vs-F split with nothing else — is there nothing
-- left in the data to break the tie with, and the rule falls back to the
-- better of the two, the same shape of last-resort, stated convention
-- lib/import/tier-mapping.ts already makes at its own boundary ("split S/A
-- and D/F rather than anywhere in the middle") rather than leaving the case
-- undefined. An item nobody voted on at all lands on Unrated — the same
-- state an un-ranked card already carries everywhere else in this app.

do $$
begin
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing.';
  end if;
  if to_regclass('public.ranked_title_publications') is null then
    raise exception 'TierListOnline: run migration 014 first — ranked_title_publications is missing.';
  end if;
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

-- ------------------------------------------------------------- the room ----

create table if not exists public.voting_sessions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  -- Narrower than posts.category on purpose: youtube (channels) and custom
  -- are both out of the pool this can be built from, per the header.
  category text not null check (category in ('movie', 'tv', 'anime', 'game', 'mixed')),
  /*
   * One frozen array of pool items, each shaped like:
   *   { itemKey, tmdbId, mediaType, title, posterPath, releaseDate }
   * `itemKey` is the same identity `battleItemId` already builds for a
   * `RankedTitle` (mediaType-tmdbId, plus -gameSource/-animeSource where the
   * id space is ambiguous — see migrations 031/032) — reused rather than
   * reinvented, so the exact collision this app has already fixed twice
   * cannot reopen quietly inside a third table. `posterPath` is resolved to
   * an absolute URL at creation time (mirrors `battles.items`, migration
   * 006, for the same reason: a card an open session points at can be
   * un-ranked, re-sourced or have its poster path's meaning change while the
   * session is still open, and this room has to keep working after that).
   */
  pool jsonb not null,
  closed_at timestamptz,
  -- Set once, by the closing function only — see the RPC below. Null while
  -- the session is open.
  result_post_id uuid references public.posts (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists voting_sessions_creator_idx
  on public.voting_sessions (creator_id, created_at desc);

-- --------------------------------------------------------------- ballots ---

create table if not exists public.voting_ballots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.voting_sessions (id) on delete cascade,
  -- Null for a guest, same as battle_participants. `on delete set null` keeps
  -- a ballot counted after its voter later deletes their account.
  user_id uuid references auth.users (id) on delete set null,
  -- One browser's own opaque id, minted client-side and kept in storage. Not
  -- personal data and not an identity claim — see the header for exactly
  -- what this does and does not defend against.
  voter_key text not null check (char_length(voter_key) between 8 and 128),
  /*
   * { [itemKey]: 'S' | 'A' | 'B' | 'C' | 'D' | 'F' }
   * Partial ballots are allowed — a voter need not rate every pool item, the
   * same way Battle's own `itemsRated` is derived rather than required to
   * equal the pool size. A value that is not one of the six letters, or a
   * key that is not in the session's own pool, is not rejected at insert
   * time (validating arbitrary JSONB keys against a stored array is not
   * something a CHECK constraint expresses cleanly) — the closing function
   * simply never counts it, which is where the pool is authoritative anyway.
   */
  ratings jsonb not null,
  created_at timestamptz not null default now(),
  -- One ballot per person per session, where "person" means "this browser,
  -- this once" — see the header. This is the whole of this feature's
  -- anti-abuse story; nothing stronger is added here on purpose.
  unique (session_id, voter_key)
);

create index if not exists voting_ballots_session_idx
  on public.voting_ballots (session_id);

alter table public.voting_sessions enable row level security;
alter table public.voting_ballots enable row level security;

-- ------------------------------------------------------------ who may ------

-- The link is the invitation, same as Battle. A blocked session (moderation,
-- not the creator's own choice — there is no owner pause switch here, unlike
-- custom_tier_lists' hidden_at, because nothing in this feature's scope asked
-- for one) stops being findable by anyone, creator included, the same way a
-- blocked custom board's cards stop resolving.
drop policy if exists "Voting sessions are readable by link" on public.voting_sessions;
create policy "Voting sessions are readable by link"
  on public.voting_sessions for select
  using (not public.is_blocked('voting_session', id));

drop policy if exists "Users can create their own voting sessions" on public.voting_sessions;
create policy "Users can create their own voting sessions"
  on public.voting_sessions for insert
  with check (auth.uid() = creator_id);

-- Mirrors "Users can delete their own battles" (006): cancelling a session
-- you started, open or already closed, removes it and its ballots (cascade).
-- Not asked for explicitly, included because Battle's own precedent has it
-- and a room its creator cannot ever remove would be a real, not a
-- hypothetical, gap.
drop policy if exists "Creators can delete their own voting sessions" on public.voting_sessions;
create policy "Creators can delete their own voting sessions"
  on public.voting_sessions for delete
  using (auth.uid() = creator_id);

-- No client-facing UPDATE policy, anywhere, for anyone. Closing a session is
-- the one way its row ever changes, and it happens inside the SECURITY
-- DEFINER function below, which does not need — and this deliberately does
-- not grant — an RLS path for an ordinary client to do the same thing.

-- Anonymous participation is the feature, same justification as Battle's own
-- insert policy: the check forbids claiming someone else's user_id, rows are
-- append-only (no UPDATE, no DELETE policy on this table at all), and a
-- flood of junk ballots pollutes one session's own result, not anyone's
-- data. New here, and not in Battle: a session that has already closed no
-- longer accepts ballots — there is no result left to affect, and a closed
-- room silently growing new ballots that nothing ever re-aggregates would be
-- its own quiet bug.
drop policy if exists "Anyone with the link can submit a ballot" on public.voting_ballots;
create policy "Anyone with the link can submit a ballot"
  on public.voting_ballots for insert
  with check (
    (user_id is null or auth.uid() = user_id)
    and exists (
      select 1 from public.voting_sessions s
      where s.id = session_id
        and s.closed_at is null
        and not public.is_blocked('voting_session', s.id)
    )
  );

-- No SELECT policy on voting_ballots at all — see the header for why. No
-- UPDATE, no DELETE policy either: append-only in the fullest sense, the
-- same as battle_participants.

-- --------------------------------------------------------- closing a room --

/*
 * Aggregates every ballot, freezes the result as an ordinary post (the same
 * two tables `publishPost` writes to — `posts` then
 * `ranked_title_publications`, same shapes, so a voted result renders
 * through the exact code path a personal list's post already does, with no
 * "is this a voting result" branch anywhere in the feed or on a profile
 * page), and marks the session closed. Returns the new post's id.
 *
 * The result's author is the session's creator, not "nobody" — posts.user_id
 * is not null and has to name someone, and crediting whoever organised the
 * room is the same shape of credit Battle already gives its own creator.
 * The creator may also have voted, through the ordinary ballot path like
 * anyone else — nothing here treats them specially as a voter, only as the
 * one account permitted to close the room and the one the result is
 * published under.
 */
create or replace function public.close_voting_session(p_session_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session public.voting_sessions%rowtype;
  v_post_id uuid;
  v_snapshot jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to close a voting session.' using errcode = '42501';
  end if;

  select * into v_session from public.voting_sessions s where s.id = p_session_id;

  if not found then
    raise exception 'That voting session does not exist.' using errcode = '42501';
  end if;

  if v_session.creator_id <> v_user then
    raise exception 'Only the creator can close this voting session.' using errcode = '42501';
  end if;

  if v_session.closed_at is not null then
    raise exception 'This voting session is already closed.' using errcode = '22023';
  end if;

  if public.is_blocked('voting_session', p_session_id) then
    raise exception 'This voting session is under review and cannot be closed right now.' using errcode = '42501';
  end if;

  with pool as (
    select
      (item ->> 'itemKey') as item_key,
      (item ->> 'tmdbId')::bigint as tmdb_id,
      (item ->> 'mediaType') as media_type,
      (item ->> 'title') as title,
      (item ->> 'posterPath') as poster_path,
      (item ->> 'releaseDate') as release_date,
      ordinality as pool_position
    from jsonb_array_elements(v_session.pool) with ordinality as t (item, ordinality)
  ),
  votes as (
    select kv.key as item_key, kv.value as tier
    from public.voting_ballots b
    cross join lateral jsonb_each_text(b.ratings) as kv (key, value)
    where b.session_id = p_session_id
      and kv.value in ('S', 'A', 'B', 'C', 'D', 'F')
  ),
  -- A vote only counts if it names an item actually in the frozen pool — a
  -- ballot referencing anything else is ignored here, not trusted.
  valid_votes as (
    select
      v.item_key,
      v.tier,
      case v.tier
        when 'S' then 0 when 'A' then 1 when 'B' then 2
        when 'C' then 3 when 'D' then 4 when 'F' then 5
      end as position
    from votes v
    join pool p on p.item_key = v.item_key
  ),
  tier_counts as (
    select item_key, tier, position, count(*) as votes
    from valid_votes
    group by item_key, tier, position
  ),
  item_means as (
    select item_key, avg(position) as mean_position
    from valid_votes
    group by item_key
  ),
  -- Per item, rank its candidate tiers: most votes first, then closest to
  -- the item's own mean position among the tied tiers, then the better tier
  -- as the final, fully-documented fallback. Rank 1 is the winner.
  ranked as (
    select
      tc.item_key,
      tc.tier,
      tc.votes,
      row_number() over (
        partition by tc.item_key
        order by tc.votes desc, abs(tc.position - im.mean_position) asc, tc.position asc
      ) as rnk
    from tier_counts tc
    join item_means im using (item_key)
  ),
  winners as (
    select item_key, tier as final_tier, votes as winning_votes
    from ranked
    where rnk = 1
  ),
  -- The window function has to land in its own CTE: Postgres refuses one
  -- nested directly inside the jsonb_agg below ("aggregate function calls
  -- cannot contain window function calls") — caught by actually running
  -- this against the local harness, not assumed from how the two usually
  -- compose.
  final_rows as (
    select
      p.tmdb_id,
      p.media_type,
      coalesce(w.final_tier, 'Unrated') as final_tier,
      p.title,
      p.poster_path,
      p.release_date,
      p.pool_position,
      row_number() over (
        partition by coalesce(w.final_tier, 'Unrated')
        order by coalesce(w.winning_votes, 0) desc, p.pool_position asc
      ) - 1 as item_order
    from pool p
    left join winners w using (item_key)
  )
  select jsonb_agg(
    jsonb_build_object(
      'tmdbId', tmdb_id,
      'mediaType', media_type,
      'tier', final_tier,
      'order', item_order,
      'title', title,
      'posterPath', poster_path,
      'releaseDate', release_date
    )
    order by pool_position
  )
  into v_snapshot
  from final_rows;

  insert into public.posts (user_id, title, description, category)
  values (v_user, v_session.title, v_session.description, v_session.category)
  returning id into v_post_id;

  insert into public.ranked_title_publications (post_id, snapshot)
  values (
    v_post_id,
    jsonb_build_object('titles', coalesce(v_snapshot, '[]'::jsonb), 'channels', '[]'::jsonb)
  );

  update public.voting_sessions
  set closed_at = now(), result_post_id = v_post_id
  where id = p_session_id;

  return v_post_id;
end;
$$;

revoke all on function public.close_voting_session(uuid) from public;
grant execute on function public.close_voting_session(uuid) to authenticated;
-- The 023 lesson, still true: `revoke all … from public` does not touch
-- anon's default-privilege grant on its own.
revoke execute on function public.close_voting_session(uuid) from anon;

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_updatable text;
  v_leaky text;
  v_selectable_ballots boolean;
begin
  -- Neither table may ever be UPDATE-able by a client. voting_sessions
  -- changes exactly once, through the SECURITY DEFINER function above;
  -- voting_ballots never changes at all.
  select string_agg(tablename || ':' || policyname, ', ') into v_updatable
  from pg_policies
  where schemaname = 'public'
    and tablename in ('voting_sessions', 'voting_ballots')
    and cmd in ('UPDATE', 'ALL');
  if v_updatable is not null then
    raise exception 'TierListOnline: a client-facing UPDATE policy exists where none should: %.', v_updatable;
  end if;

  -- voting_ballots must have no SELECT policy at all — see the header.
  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voting_ballots' and cmd in ('SELECT', 'ALL')
  ) into v_selectable_ballots;
  if v_selectable_ballots then
    raise exception 'TierListOnline: voting_ballots has a SELECT policy — it should have none.';
  end if;

  select string_agg(p.proname, ', ') into v_leaky
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'close_voting_session'
    and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_leaky is not null then
    raise exception 'TierListOnline: anon can execute close_voting_session.';
  end if;

  if not has_function_privilege('authenticated', 'public.close_voting_session(uuid)', 'EXECUTE') then
    raise exception 'TierListOnline: authenticated cannot execute close_voting_session — no session could ever be closed.';
  end if;

  raise notice 'TierListOnline: voting_sessions and voting_ballots installed; closing is atomic, ballots are append-only, and nobody but the closing function can read a ballot.';
end $$;
