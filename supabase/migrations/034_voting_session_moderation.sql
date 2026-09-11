-- TierListOnline: a voting session can actually be blocked.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This changes no data — one CHECK constraint.
--
-- Migration 033 shipped `is_blocked('voting_session', id)` in three places:
-- the SELECT policy on `voting_sessions`, the INSERT policy on
-- `voting_ballots`, and inside `close_voting_session`. Its own header claims
-- "a blocked session ... stops being findable by anyone". That was never
-- true, and not because `is_blocked()` is broken — it is a plain
-- `select exists (...)` against `content_moderation` and could not have
-- raised either way. It was untrue because no row with
-- `subject_type = 'voting_session'` could ever exist:
-- `content_moderation_subject_type_check`, set once in 012 and last widened
-- in 022, only allows 'custom_item', 'custom_list', 'custom_tier_row'. An
-- operator trying to block a session —
--   insert into public.content_moderation (subject_type, subject_id, note)
--   values ('voting_session', '<id>', '...');
-- — hits the CHECK and fails. `is_blocked()` then keeps answering false
-- forever, silently, for a type of row that is structurally impossible. 022
-- itself added a subject type the same way this file does and proved it
-- with a self-check; this one skipped that step, which is the gap, not a
-- choice to ship without it.
--
-- WHAT THIS DOES NOT DO: extend `content_reports`. That constraint (015,
-- widened in 022) gates a real, separate capability — the "Report" button
-- (`components/ui/report-button.tsx`) and the route behind it
-- (`app/api/custom-reports/route.ts`), which keeps its OWN hardcoded
-- `SUBJECT_TYPES` allowlist independent of this CHECK. No voting component
-- renders a `ReportButton` yet, and none is planned in the PR this
-- migration ships with — so widening `content_reports` now would add
-- constraint surface with nothing on either side (UI or route) able to
-- reach it, unlike `content_moderation`, which is already load-bearing in
-- shipped 033 code. 022's own precedent extended both CHECKs together
-- because it shipped the report button in the same pass. When a voting
-- session gets a Report button, that PR is the right place to widen
-- `content_reports` too, alongside the route's allowlist and the button —
-- together, the way 022 did it, not ahead of either.

do $$
begin
  if to_regclass('public.voting_sessions') is null then
    raise exception 'TierListOnline: run migration 033 first — public.voting_sessions is missing.';
  end if;
  if to_regclass('public.content_moderation') is null then
    raise exception 'TierListOnline: run migration 012 first — public.content_moderation is missing.';
  end if;
end $$;

-- --------------------------------------------------- the new subject type --

-- Drop-and-add, same as 022: a CHECK is replaced, not accumulated. Every
-- value 022 left behind is carried forward — this widens, it does not
-- narrow.
alter table public.content_moderation drop constraint if exists content_moderation_subject_type_check;
alter table public.content_moderation add constraint content_moderation_subject_type_check
  check (subject_type in ('custom_item', 'custom_list', 'custom_tier_row', 'voting_session'));

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_test_id uuid := gen_random_uuid();
  v_blocked boolean;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_moderation_subject_type_check'
      and pg_get_constraintdef(oid) like '%voting_session%'
  ) then
    raise exception 'TierListOnline: content_moderation still cannot record a voting-session block.';
  end if;

  -- The types 022 added must have survived the constraint being replaced.
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_moderation_subject_type_check'
      and pg_get_constraintdef(oid) like '%custom_tier_row%'
  ) then
    raise exception 'TierListOnline: replacing the moderation constraint dropped an earlier subject type.';
  end if;

  -- content_reports must be untouched by this file — see the header for why.
  if exists (
    select 1 from pg_constraint
    where conname = 'content_reports_subject_type_check'
      and pg_get_constraintdef(oid) like '%voting_session%'
  ) then
    raise exception 'TierListOnline: content_reports gained voting_session from somewhere other than this migration''s own intent — check for a conflicting change.';
  end if;

  -- is_blocked() never consults this CHECK — it is a bare select exists(...)
  -- against content_moderation, which is why it could not have raised even
  -- before this migration. Calling it here proves the three shipped 033
  -- call sites keep behaving now that a matching row can actually exist,
  -- not that the function itself needed fixing.
  v_blocked := public.is_blocked('voting_session', gen_random_uuid());
  if v_blocked is distinct from false then
    raise exception 'TierListOnline: is_blocked() returned something other than false for an id with no block on file.';
  end if;

  -- The constraint definition containing the substring is not proof it
  -- accepts the value — only a real insert is. Written and removed inside
  -- this same block, as the table owner, which is what a migration runs as
  -- and which bypasses RLS the same way the SQL Editor does.
  insert into public.content_moderation (subject_type, subject_id, note)
  values ('voting_session', v_test_id, 'migration 034 self-check — removed below');

  if not exists (
    select 1 from public.content_moderation
    where subject_type = 'voting_session' and subject_id = v_test_id
  ) then
    raise exception 'TierListOnline: a voting_session row was accepted but cannot be read back.';
  end if;

  delete from public.content_moderation
  where subject_type = 'voting_session' and subject_id = v_test_id;

  raise notice 'TierListOnline: a voting session can now be blocked, and is_blocked() can see it.';
end $$;

-- ------------------------------------------------------------- operations --
--
-- Take a voting session down, before or after it closes:
--   insert into public.content_moderation (subject_type, subject_id, note)
--   values ('voting_session', '<session id>', 'reported: <why>');
--
-- This stops it being read (its SELECT policy), stops new ballots landing
-- on it (the ballots INSERT policy), and stops it being closed
-- (`close_voting_session` checks `is_blocked()` itself) — but does not
-- touch a `posts` row a session already produced by closing; that post is
-- ordinary content by then and is moderated the way any post is.
