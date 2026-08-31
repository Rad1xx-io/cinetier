-- TierListOnline: make the profile privacy switch actually cover the profile.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This changes no data — one SELECT policy, nothing
-- else — but it changes who can read a table, so read what it keeps readable.
--
-- `Profiles are publicly readable` was `using (true)`. The intent was sound:
-- resolving /u/<username> happens before, and usually without, a session, so
-- the lookup has to work for a stranger. What `true` also allowed was the
-- lookup with no username in it —
--
--   GET /rest/v1/profiles?select=*
--
-- which hands back every account on the site, including the ones that set
-- `is_public = false` and have never posted anything. Their handle, display
-- name, account id and signup time, in one request, to anyone with the anon
-- key. `is_public` gated their rankings and never gated them.
--
-- What stays readable, deliberately:
--
--   * A public profile. That is what the switch means, and /u/<username>
--     depends on it.
--   * Your own, whatever the switch says.
--   * Anyone who has published a post — INCLUDING a private one. A post
--     already carries its author's handle in the feed, so hiding the profile
--     row would not hide the name; it would only break the byline. The feed
--     view joins profiles with `security_invoker`, so a profile this policy
--     refuses is a post that silently vanishes from the feed, and posting is
--     something a private account is allowed to do (post_feed selects
--     `is_public` precisely so the card can offer the fork button or not).
--
-- What stops being readable: an account that is private and has never posted.
-- Nothing in the app ever needed to read one of those, which is the test this
-- policy is really applying — not "who is allowed to look" but "what has this
-- person actually made public".

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — public.profiles is missing.';
  end if;
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing, and this policy reads it.';
  end if;
end $$;

-- ---------------------------------------------------------- the policy ----

/*
 * Replaces the policy 004 creates, under the same name so the two cannot both
 * be in force. Policies are OR'd together — a second, permissive one would
 * simply re-open what this closes, which is why this is a replacement rather
 * than an addition.
 *
 * 004's own definition has been narrowed to `is_public or auth.uid() = id` in
 * the same change, so re-running it can no longer restore `using (true)`. It
 * deliberately stops short of the posts clause below: at 004's point in the
 * sequence `public.posts` does not exist yet, and a policy naming a missing
 * table cannot be created at all. Re-running 004 after this therefore narrows
 * the rule rather than widening it — private accounts' posts would lose their
 * byline until this migration is re-applied, which is a visible degradation
 * and not a hole. That direction was chosen on purpose.
 *
 * No recursion: `posts` has its own SELECT policy of `using (true)` and names
 * no other table, so evaluating this one cannot re-enter it.
 */
drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (
    is_public
    or auth.uid() = id
    or exists (select 1 from public.posts p where p.user_id = profiles.id)
  );

/*
 * The subquery runs per candidate row, so it wants the index it is looking
 * for. 009 indexes posts by (created_at) for the feed's ordering, not by
 * author.
 */
create index if not exists posts_user_id_idx on public.posts (user_id);

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_qual text;
begin
  select qual into v_qual
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'Profiles are publicly readable';

  if v_qual is null then
    raise exception 'TierListOnline: the profiles select policy is missing.';
  end if;

  -- `using (true)` renders as exactly this, and is the thing being replaced.
  if v_qual = 'true' then
    raise exception 'TierListOnline: the profiles select policy is still unconditional.';
  end if;

  if v_qual not like '%is_public%' then
    raise exception 'TierListOnline: the profiles select policy does not consult is_public.';
  end if;

  if v_qual not like '%posts%' then
    raise exception 'TierListOnline: the profiles select policy would drop posting accounts from the feed.';
  end if;

  -- The two policies that read profiles to decide their own visibility must
  -- still be there; both ask for `is_public`, which this policy still grants.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ranked_titles'
      and policyname = 'Published tier lists are publicly readable'
  ) then
    raise exception 'TierListOnline: the published-tier-list policy from 004 is missing.';
  end if;

  raise notice 'TierListOnline: a private profile that has never posted is no longer enumerable.';
end $$;
