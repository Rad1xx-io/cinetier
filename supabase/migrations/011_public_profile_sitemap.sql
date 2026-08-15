-- TierListOnline: published profiles with the size of their board, for the sitemap.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- Exposes nothing new. Every column here is already readable by anyone through
-- the policies from migration 004 — this view only saves the sitemap from
-- fetching a profile's whole board just to learn whether it has one.
--
-- Safe to re-run.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

/*
 * One row per published profile, carrying how many entries its board holds.
 *
 * Counted in Postgres rather than in the client: the alternative is pulling
 * every ranked row for every public user and reducing them in JavaScript, which
 * moves thousands of rows across the wire to answer a yes/no question.
 *
 * `security_invoker` keeps the caller's RLS in force, so an anonymous crawler
 * counts exactly the rows it would have been allowed to read — which, for a
 * published profile, is all of them.
 */
create or replace view public.public_profile_sitemap
with (security_invoker = true) as
select
  p.id,
  p.username,
  p.updated_at,
  (
    (select count(*) from public.ranked_titles t where t.user_id = p.id)
    + (select count(*) from public.ranked_channels c where c.user_id = p.id)
  ) as items_count
from public.profiles p
where p.is_public;

grant select on public.public_profile_sitemap to anon, authenticated;
