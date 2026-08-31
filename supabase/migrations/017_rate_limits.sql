-- TierListOnline: a rate limiter the catalogue routes can actually rely on.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. The problem this solves is not abuse of this
-- database — it is abuse of somebody else's API.
--
-- /api/youtube/search is anonymous, and one call to it costs 100 units of a
-- 10,000-unit daily YouTube quota, because search.list is priced that way and
-- discoverChannels issues more than one request per visit. Roughly a hundred
-- HTTP requests, which is seconds of work, takes the YouTube half of this site
-- down until the quota resets. TMDB, IGDB and Steam are the same shape with a
-- more forgiving budget. `next: { revalidate }` does not help: it keys on the
-- url, and a unique query string is a cache miss by construction.
--
-- Why here rather than in a Redis. This app runs on serverless functions, so a
-- counter in process memory is a counter per instance and per cold start —
-- worth nothing. Postgres is the only shared, durable store this project
-- already has, and one upsert against a tiny table is cheap next to the
-- upstream call it is protecting. Adding a second managed service to hold
-- integers was not worth the operational surface.
--
-- The table is reachable only through the function below: RLS on, no policies,
-- exactly like upload_grants.

-- --------------------------------------------------------------- the table --

create table if not exists public.rate_limits (
  -- An opaque key. The application hashes "who is asking" together with "which
  -- family of endpoints" before it gets here, so this column holds no address
  -- and no user id — see lib/rate-limit/limiter.ts.
  bucket text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

-- Only for the sweep at the bottom of the function.
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;

-- No policies, deliberately. RLS with none denies every API role, so the only
-- way to touch this table is the security-definer function below — which means
-- a client cannot read another bucket's count, and cannot reset its own.

-- ------------------------------------------------------------ the function --

/*
 * Counts one request against a bucket and says whether it may proceed.
 *
 * Returns the number of seconds the caller should wait: 0 when the request is
 * allowed, a positive number when it is not, which is what becomes
 * `Retry-After`.
 *
 * Held to the same standard as attach_upload, since it is security definer:
 *
 *   * The whole decision is one statement. Read-then-write would let two
 *     concurrent requests both see the same count and both be allowed, which
 *     is exactly the race a limiter exists to lose gracefully; `insert … on
 *     conflict do update` is atomic against the row.
 *   * p_bucket is caller-supplied and is treated as opaque — it is only ever a
 *     primary key here, never interpolated into anything. The application
 *     HMACs it before calling, so a browser holding the public anon key cannot
 *     compute the bucket belonging to a different visitor.
 *   * p_limit and p_window_seconds are caller-supplied too, and that is safe in
 *     the direction that matters: passing a huge limit only means the caller's
 *     own counter still goes up while they are not blocked. There is no
 *     argument that makes a count go *down*, so a request cannot buy itself
 *     more budget. They are clamped anyway, so a nonsensical value cannot make
 *     the window absurd.
 *   * search_path is empty and every name is schema-qualified.
 *   * It reveals nothing: an integer, never the count, never the limit.
 */
create or replace function public.consume_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 1), 1), 100000);
  v_window integer := least(greatest(coalesce(p_window_seconds, 60), 1), 86400);
  v_count integer;
  v_window_start timestamptz;
  v_retry integer;
begin
  if p_bucket is null or length(p_bucket) = 0 or length(p_bucket) > 200 then
    -- A caller that cannot name a bucket is not one this can account for.
    -- Refused rather than waved through, so a bug upstream fails visibly.
    raise exception 'A rate limit bucket is required.' using errcode = '22023';
  end if;

  insert into public.rate_limits as rl (bucket, window_start, count)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
  set
    -- Both columns branch on the same condition: either the stored window has
    -- run out, in which case this request starts a fresh one, or it has not,
    -- in which case the request joins it.
    window_start = case
      when rl.window_start < now() - make_interval(secs => v_window) then now()
      else rl.window_start
    end,
    count = case
      when rl.window_start < now() - make_interval(secs => v_window) then 1
      else rl.count + 1
    end
  returning rl.count, rl.window_start into v_count, v_window_start;

  /*
   * Housekeeping, on roughly one call in five hundred.
   *
   * Every distinct visitor leaves a row behind, so without this the table grows
   * with the audience and never shrinks. A scheduled job would be tidier, but
   * this project applies migrations by hand and has no cron; doing it here
   * keeps the table bounded with no operational step to forget. Anything older
   * than a day is past every window this function accepts.
   */
  if random() < 0.002 then
    delete from public.rate_limits
    where window_start < now() - interval '1 day';
  end if;

  if v_count <= v_limit then
    return 0;
  end if;

  v_retry := ceil(extract(epoch from (v_window_start + make_interval(secs => v_window)) - now()));
  -- A window that has just turned over can compute to zero or below; the
  -- caller needs a number it can put in a header and honour.
  return greatest(v_retry, 1);
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public;
grant execute on function public.consume_rate_limit(text, integer, integer) to anon, authenticated;

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_first integer;
  v_second integer;
  v_third integer;
begin
  delete from public.rate_limits where bucket = 'self-check';

  -- Two allowed, the third refused, with a wait the caller can act on.
  v_first := public.consume_rate_limit('self-check', 2, 60);
  v_second := public.consume_rate_limit('self-check', 2, 60);
  v_third := public.consume_rate_limit('self-check', 2, 60);

  if v_first <> 0 or v_second <> 0 then
    raise exception 'TierListOnline: the limiter refused a request inside its own budget.';
  end if;
  if v_third <= 0 then
    raise exception 'TierListOnline: the limiter allowed a request past its budget.';
  end if;

  delete from public.rate_limits where bucket = 'self-check';

  if exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_limits'
  ) then
    raise exception 'TierListOnline: rate_limits must have no policies — any policy makes it reachable from the API.';
  end if;

  raise notice 'TierListOnline: the rate limiter is installed and counts.';
end $$;
