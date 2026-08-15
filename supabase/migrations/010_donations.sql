-- CineTier: author support links, and a place to record donations later.
-- Run once in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
--
-- READ THIS BEFORE RUNNING. Two things here, at very different stages:
--
--   * `profiles.donation_url` is live. It is a link the author enters and
--     visitors click — CineTier never touches money, it forwards to Boosty,
--     CloudTips, Patreon or wherever. It is public, like the rest of a profile.
--
--   * `donations` is schema ahead of a feature. Nothing in the app writes to it,
--     because nothing in the app knows whether a payment happened — that would
--     take a webhook from the payment provider. The table is created now so the
--     shape is settled, and is deliberately left with NO insert policy: a client
--     that could write here could invent donations it never made.
--
-- Safe to re-run.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'CineTier: run migration 004 first — public.profiles is missing.';
  end if;
end $$;

alter table public.profiles
  add column if not exists donation_url text;

-- Scheme is checked in the database as well as the client: this value is opened
-- in a visitor's browser, and `javascript:` in a profile field is stored XSS.
alter table public.profiles
  drop constraint if exists profiles_donation_url_check;

alter table public.profiles
  add constraint profiles_donation_url_check
  check (donation_url is null or donation_url ~* '^https?://[^\s/$.?#].[^\s]*$');

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  -- Null for an anonymous donor, and null again if they later delete the
  -- account: the recipient's record of being paid should outlive the payer.
  donor_id uuid references auth.users (id) on delete set null,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  /*
   * The spec this came from referenced `tier_lists(id)`, which does not exist in
   * CineTier — a board here is a set of `ranked_titles` rows belonging to a
   * user, not an entity with an id of its own. Kept as a plain uuid so a future
   * per-list identity (a feed post, a battle) can fill it without a migration,
   * with no foreign key to a table that is not there.
   */
  tier_list_id uuid,
  amount numeric(10, 2) not null check (amount > 0),
  currency varchar(3) not null default 'USD',
  status varchar(20) not null default 'completed'
    check (status in ('pending', 'completed', 'failed', 'refunded')),
  created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists donations_recipient_idx
  on public.donations (recipient_id, created_at desc);
create index if not exists donations_donor_idx
  on public.donations (donor_id, created_at desc);

alter table public.donations enable row level security;

-- Reading only, and only your own side of the transaction. There is
-- intentionally no insert, update or delete policy: the only writer should be a
-- payment webhook using the service role, which bypasses RLS. Until that
-- exists, every client write fails — which is the correct answer, because until
-- then the client has no way to know a payment actually happened.
drop policy if exists "Recipients can read their donations" on public.donations;
create policy "Recipients can read their donations"
  on public.donations for select
  using (auth.uid() = recipient_id);

drop policy if exists "Donors can read their donations" on public.donations;
create policy "Donors can read their donations"
  on public.donations for select
  using (auth.uid() = donor_id);

/*
 * The feed credits an author by name, so it needs their support link too.
 *
 * `create or replace view` may append columns but not reorder them, so
 * donation_url goes last and every other column stays exactly where 009 put it.
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
  (select count(*) from public.post_comments c where c.post_id = p.id) as comments_count,
  pr.donation_url
from public.posts p
join public.profiles pr on pr.id = p.user_id;

grant select on public.post_feed to anon, authenticated;
