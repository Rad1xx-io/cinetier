-- TierListOnline: one report per person per thing.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This migration deletes rows — see the block below
-- for exactly which, and why they are redundant rather than lost.
--
-- `content_reports` had no uniqueness of any kind, so the same account could
-- file the same complaint about the same card an unlimited number of times.
-- Each one writes a row, logs at error level and may fire a webhook at whoever
-- moderates this site, so the cost of the abusive version is a person's
-- attention — which is the one resource this feature spends and cannot buy
-- more of.
--
-- The constraint is on (reporter_id, subject_type, subject_id): one person, one
-- verdict, per thing. It deliberately does NOT include `reason` — otherwise
-- changing a word would mint a fresh report — and deliberately does not include
-- `status`, so that a report a moderator has already dismissed cannot be
-- re-filed by the same person to push it back into the queue.
--
-- Different people reporting the same thing is the signal this feature exists
-- to collect, and that stays untouched. So does one person reporting several
-- different things.

do $$
begin
  if to_regclass('public.content_reports') is null then
    raise exception 'TierListOnline: run migration 012 first — public.content_reports is missing.';
  end if;
end $$;

-- ------------------------------------------------ existing duplicate rows ---

/*
 * The constraint cannot be added while duplicates exist, so they go first.
 *
 * The oldest row of each group survives — it carries the reason as first
 * written, before any attempt to reword it — and the rest are removed. What is
 * lost is a repetition of a complaint that is still on file, from the same
 * person, about the same subject. Nothing that was reported stops being
 * reported.
 *
 * The count is raised as a notice rather than being silent, because a
 * migration that deletes rows should say how many.
 */
do $$
declare
  v_removed integer;
begin
  with ranked as (
    select
      id,
      row_number() over (
        partition by reporter_id, subject_type, subject_id
        order by created_at asc, id asc
      ) as n
    from public.content_reports
    where reporter_id is not null
  )
  delete from public.content_reports r
  using ranked
  where r.id = ranked.id and ranked.n > 1;

  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    raise notice 'TierListOnline: removed % duplicate report(s) before adding the constraint.', v_removed;
  else
    raise notice 'TierListOnline: no duplicate reports to remove.';
  end if;
end $$;

-- -------------------------------------------------------- the constraint ---

/*
 * A unique index rather than a table constraint, so it can be partial.
 *
 * `reporter_id` is nullable — it is set null when an account is deleted, by
 * the foreign key in 012 — and Postgres treats nulls as distinct, so those
 * rows would never collide anyway. Excluding them explicitly says so, and
 * keeps the index off history that no longer belongs to anybody.
 */
create unique index if not exists content_reports_one_per_subject_idx
  on public.content_reports (reporter_id, subject_type, subject_id)
  where reporter_id is not null;

-- ------------------------------------------------------------- self-check --

do $$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'content_reports'
      and indexname = 'content_reports_one_per_subject_idx'
  ) then
    raise exception 'TierListOnline: the duplicate-report index is missing.';
  end if;

  -- The insert policy from 012 must still be the only way in, and it must
  -- still tie a report to the account filing it. Without that clause the
  -- constraint above would be trivially sidestepped by claiming to be someone
  -- else.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'content_reports'
      and cmd = 'INSERT'
      and with_check like '%auth.uid()%'
  ) then
    raise exception 'TierListOnline: content_reports lost its reporter-identity insert policy.';
  end if;

  raise notice 'TierListOnline: one report per person per subject is now enforced.';
end $$;
