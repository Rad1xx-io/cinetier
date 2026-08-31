-- TierListOnline: make the upload functions' grants say what was meant.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This changes no data, no policy and no function
-- body — three EXECUTE grants, nothing else. It is hardening, not a fix for
-- anything currently exploitable, and the reason it is worth doing is at the
-- bottom.
--
-- Migrations 012 and 016 each end a function definition with:
--
--   revoke all on function … from public;
--   grant  execute on function … to authenticated;
--
-- which reads as "authenticated only". It is not. `public` there is the
-- PUBLIC pseudo-role, and revoking it does not touch a grant held by `anon`.
-- Supabase ships
--
--   alter default privileges in schema public
--     grant execute on functions to anon, authenticated;
--
-- so every one of these functions was granted to `anon` at the moment it was
-- created, and the later `grant … to authenticated` neither added nor removed
-- anything for that role. Read out of `pg_proc.proacl` rather than assumed:
--
--   attach_upload        :: postgres=X/postgres anon=X/postgres authenticated=X/postgres
--   issue_upload_grant   :: postgres=X/postgres anon=X/postgres authenticated=X/postgres
--   clear_tier_row_image :: postgres=X/postgres anon=X/postgres authenticated=X/postgres
--
-- NOT EXPLOITABLE TODAY, and that was checked by calling all three as `anon`
-- rather than by reading them:
--
--   issue_upload_grant   -> refused: "Sign in to upload a picture."
--   attach_upload        -> refused: "No upload was granted for that file."
--   clear_tier_row_image -> refused: "Sign in to edit a board."
--
-- Each refuses because its own body tests `auth.uid()`. The grant is the outer
-- ring that was supposed to make that test the second line of defence rather
-- than the only one — so this restores the ring. The next security-definer
-- function somebody writes should not be the one that discovers the internal
-- check was load-bearing.
--
-- Three functions are deliberately NOT touched:
--
--   * `is_blocked` — granted to anon on purpose. The RLS policies call it for
--     anonymous readers; revoking it would break every public board.
--   * `consume_rate_limit` — anonymous traffic is most of what it counts.
--   * `increment_post_views` — counting a signed-out visitor's view is the
--     feature.
--
-- `has_upload_grant` is also left alone, deliberately. It is a boolean
-- predicate that leaks nothing, and the storage INSERT policy calls it — that
-- policy is evaluated as the caller, so revoking it would turn an anonymous
-- upload attempt from a clean row-level-security refusal into a
-- permission-denied error on a function. Both refuse the write; only one of
-- them is a sentence anybody can act on.

do $$
begin
  if to_regclass('public.upload_grants') is null then
    raise exception 'TierListOnline: run migration 012 first — the upload tables are missing.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'clear_tier_row_image'
  ) then
    raise exception 'TierListOnline: run migration 016 first — clear_tier_row_image is missing.';
  end if;
end $$;

revoke execute on function public.issue_upload_grant(uuid, boolean, text, boolean) from anon;
revoke execute on function public.attach_upload(text, text, uuid, uuid) from anon;
revoke execute on function public.clear_tier_row_image(uuid) from anon;

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_leaky text;
begin
  select string_agg(p.proname, ', ') into v_leaky
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('issue_upload_grant', 'attach_upload', 'clear_tier_row_image')
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_leaky is not null then
    raise exception 'TierListOnline: anon can still execute %.', v_leaky;
  end if;

  -- The other half: the app must still be able to upload. Revoking from the
  -- wrong role here would break every board silently.
  if not (
    has_function_privilege('authenticated', 'public.issue_upload_grant(uuid, boolean, text, boolean)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.attach_upload(text, text, uuid, uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.clear_tier_row_image(uuid)', 'EXECUTE')
  ) then
    raise exception 'TierListOnline: authenticated lost execute on the upload flow — uploads would stop working.';
  end if;

  -- And the three that are anon-callable on purpose must stay that way.
  if not (
    has_function_privilege('anon', 'public.is_blocked(text, uuid)', 'EXECUTE')
    and has_function_privilege('anon', 'public.consume_rate_limit(text, integer, integer)', 'EXECUTE')
    and has_function_privilege('anon', 'public.increment_post_views(uuid, text)', 'EXECUTE')
  ) then
    raise exception 'TierListOnline: an intentionally anon-callable function lost its grant — public boards, rate limiting or view counting would break.';
  end if;

  raise notice 'TierListOnline: the upload flow is executable by authenticated only.';
end $$;
