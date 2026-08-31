-- TierListOnline: stop a view counter from being a number anyone can type.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING.
--
-- `increment_post_views` is security definer and granted to `anon`, which is
-- correct — a view has to count for people who are not signed in, and the
-- alternative (an UPDATE policy on `posts`) would hand every visitor write
-- access to a row in order to move one integer on it. That part of migration
-- 009 stays exactly as it is, including the clause in the posts UPDATE policy
-- that stops an author editing their own `views_count`. That clause is a good
-- control and nothing here weakens it.
--
-- What was wrong is that the function had no memory. One statement, no
-- identity, no ceiling:
--
--   POST /rest/v1/rpc/increment_post_views  { "p_post_id": "<any post>" }
--
-- repeated as fast as the network allows, against anybody's post. The only
-- guard was `viewedRef` in post-dialog.tsx, which is a React ref and therefore
-- not a guard at all — nothing obliges an attacker to use the browser.
--
-- Three layers replace it, because no single one is enough on its own:
--
--   1. Per-viewer de-duplication. One counted view per viewer per post per
--      VIEW_DEDUPE_WINDOW. For a signed-in visitor the viewer is auth.uid();
--      for everyone else it is an opaque key the application supplies.
--   2. A per-post ceiling. Whatever viewer key arrives — including a fresh
--      random one every call, which is what a direct attacker would send —
--      a single post's counter moves at most VIEWS_PER_POST_PER_HOUR times an
--      hour. This is the layer that bounds abuse that ignores layer 1.
--   3. The application's own rate limit on /api/post-views (migration 017's
--      limiter, per address), which is what makes layer 2 rare in normal use.
--
-- No IP address is stored. The application hashes the address before it ever
-- reaches this database, and what is kept here is that hash — enough to
-- recognise a repeat visit, not enough to be a record of who visited.

do $$
begin
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing.';
  end if;
  if to_regclass('public.rate_limits') is null then
    raise exception 'TierListOnline: run migration 017 first — the rate limiter is missing.';
  end if;
end $$;

-- ------------------------------------------------------------ the ledger ---

/*
 * One row per (post, viewer). Not an audit log — it holds no address, no user
 * agent and no timestamp beyond the one it needs to expire itself, and it is
 * pruned below.
 *
 * `on delete cascade` so deleting a post takes its marks with it, the same way
 * everything else attached to a post already behaves.
 */
create table if not exists public.post_view_marks (
  post_id uuid not null references public.posts (id) on delete cascade,
  -- sha256 of the viewer key, hex. Never the key itself, so this table cannot
  -- be read back into the thing it was derived from.
  viewer_hash text not null,
  seen_at timestamptz not null default now(),
  primary key (post_id, viewer_hash)
);

create index if not exists post_view_marks_seen_idx
  on public.post_view_marks (seen_at);

/*
 * No policies, deliberately, and RLS on — the same pattern as `upload_grants`
 * and `rate_limits`. Row-level security with no policy denies every API role,
 * so this table is reachable only from the function below and from the SQL
 * editor. A visitor cannot read who has viewed what, and cannot delete their
 * own mark to get a second count.
 */
alter table public.post_view_marks enable row level security;

-- ---------------------------------------------------------- the function ---

/*
 * Security review, to the same standard as attach_upload:
 *
 *   * search_path is empty and every name is schema-qualified, so nothing here
 *     resolves through a schema a caller controls.
 *   * The only write to `posts` is `views_count = views_count + 1` on one row
 *     named by primary key. No other column is reachable, and the value cannot
 *     be chosen — only incremented by one.
 *   * p_post_id is used only as a key. A post that does not exist takes the
 *     early return and leaves nothing behind, so this cannot be used to probe
 *     for or create rows.
 *   * p_viewer_key is opaque and hashed before storage. It is attacker-chosen,
 *     which is exactly why layer 2 exists: a caller who varies it defeats the
 *     de-duplication and still meets the per-post ceiling.
 *   * Returns void, as before, so an attacker learns nothing from the result
 *     about whether their call counted.
 *
 * The signature gains a defaulted parameter rather than changing, so the
 * existing one-argument call site keeps working through PostgREST.
 */
create or replace function public.increment_post_views(
  p_post_id uuid,
  p_viewer_key text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- One counted view per viewer per post per six hours. Long enough that
  -- reopening a post while reading the feed does not count twice, short enough
  -- that coming back tomorrow does.
  c_dedupe_window constant interval := interval '6 hours';
  -- The ceiling that bounds a caller who ignores the viewer key entirely.
  -- Comfortably above anything this site's traffic produces for one post, and
  -- far below "unlimited".
  c_per_post_hourly constant integer := 300;

  v_viewer text;
  v_hash text;
  v_fresh boolean;
begin
  if p_post_id is null then
    return;
  end if;

  -- A post that does not exist is not counted and leaves no trace.
  if not exists (select 1 from public.posts p where p.id = p_post_id) then
    return;
  end if;

  /*
   * A signed-in viewer is identified by their account, which no client-supplied
   * value can override — so for them the de-duplication cannot be defeated by
   * varying the key. Everyone else is identified by what the application sends;
   * `anonymous` is the shared bucket for a caller that sends nothing, which
   * fails toward counting less rather than more.
   */
  v_viewer := coalesce(
    'user:' || nullif(auth.uid()::text, ''),
    'key:' || nullif(left(coalesce(p_viewer_key, ''), 200), ''),
    'anonymous'
  );
  -- `sha256` is a Postgres built-in (pg_catalog, always on the search path
  -- even when it is set to empty), so this needs no extension — pgcrypto's
  -- `digest` would have had to be found in whichever schema Supabase installed
  -- it into, which is exactly the kind of lookup an empty search_path forbids.
  v_hash := encode(sha256(convert_to(v_viewer, 'UTF8')), 'hex');

  /*
   * Layer 1. The insert is the test: it lands only when this viewer has no
   * mark on this post, or when the one they had has aged past the window. Both
   * cases are one statement, so two simultaneous requests cannot both decide
   * they are first.
   */
  insert into public.post_view_marks as m (post_id, viewer_hash, seen_at)
  values (p_post_id, v_hash, now())
  on conflict (post_id, viewer_hash) do update
  set seen_at = now()
  where m.seen_at < now() - c_dedupe_window
  returning true into v_fresh;

  if v_fresh is null then
    -- Already counted for this viewer inside the window.
    return;
  end if;

  /*
   * Layer 2. Reuses migration 017's limiter rather than growing a second one:
   * it is the same question — "has this key moved too often lately" — and one
   * implementation of that is easier to reason about than two. Returns 0 when
   * the call is within budget.
   */
  if public.consume_rate_limit('post-views:' || p_post_id::text, c_per_post_hourly, 3600) <> 0 then
    return;
  end if;

  update public.posts
  set views_count = views_count + 1
  where id = p_post_id;

  /*
   * Housekeeping, on roughly one call in five hundred — the same approach as
   * migration 017, and for the same reason: this project applies migrations by
   * hand and has no scheduler. A mark older than the window can never suppress
   * a count again.
   */
  if random() < 0.002 then
    delete from public.post_view_marks
    where seen_at < now() - c_dedupe_window;
  end if;
end;
$$;

revoke all on function public.increment_post_views(uuid, text) from public;
grant execute on function public.increment_post_views(uuid, text) to anon, authenticated;

/*
 * The one-argument version from migration 009 is dropped, not left beside this
 * one. Leaving it would be leaving the unthrottled function in place under a
 * signature PostgREST would happily resolve — the whole hole, still reachable,
 * behind an older overload.
 */
drop function if exists public.increment_post_views(uuid);

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_overloads integer;
begin
  select count(*) into v_overloads
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'increment_post_views';

  if v_overloads <> 1 then
    raise exception 'TierListOnline: expected exactly one increment_post_views, found % — an unthrottled overload would still be callable.', v_overloads;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'post_view_marks'
  ) then
    raise exception 'TierListOnline: post_view_marks must have no policies — any policy makes it reachable from the API.';
  end if;

  -- The control this migration must not have broken.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'posts' and cmd = 'UPDATE'
      and qual is not null
  ) then
    raise exception 'TierListOnline: the posts UPDATE policy is missing — views_count tampering would be open.';
  end if;

  raise notice 'TierListOnline: post views are de-duplicated per viewer and capped per post.';
end $$;
