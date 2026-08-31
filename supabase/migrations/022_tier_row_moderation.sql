-- TierListOnline: a tier's own picture can be reported and taken down.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This changes no data — two CHECK constraints and
-- four policies.
--
-- A tier row carries an uploaded picture, exactly like a card does:
-- `custom_tier_rows.image_path`, written by `attach_upload` through the same
-- grant flow, served from the same bucket through the same signed urls. What
-- it did not have was a way to take one down. `content_moderation` and
-- `content_reports` both accepted only 'custom_item' and 'custom_list', so a
-- tier picture could not be reported by a visitor and could not be blocked by
-- an operator. The only lever was blocking the entire board, which takes down
-- every other picture on it too.
--
-- This is the same moderation system, given one more subject type. Nothing
-- parallel is introduced: the same `content_moderation` table, the same
-- `is_blocked()` function, the same `content_reports` insert policy, the same
-- storage policy. The storage policy is deliberately NOT touched — it already
-- resolves a tier picture by asking whether the tier row is visible, and the
-- policy below is what answers that, so a block lands on the signed url for
-- free.
--
-- What this does not change, on purpose:
--
--   * The reporter still cannot cause anything to happen. A report is a row a
--     person reads; it grants no access and triggers nothing automatic. That
--     is why `subject_id` has no foreign key here, for this type or any of the
--     four that came before — a report about something already deleted is
--     still worth reading, and a report is not a capability.
--   * A block on a row that is later deleted is left behind. `is_blocked()`
--     answers true for an id that no longer exists, which fails safe, and ids
--     are `gen_random_uuid()` so nothing can inherit one. Same as the existing
--     types.

do $$
begin
  if to_regclass('public.custom_tier_rows') is null then
    raise exception 'TierListOnline: run migration 012 first — the custom board tables are missing.';
  end if;
  if to_regclass('public.content_moderation') is null then
    raise exception 'TierListOnline: run migration 012 first — public.content_moderation is missing.';
  end if;
end $$;

-- --------------------------------------------------- the new subject type --

/*
 * Both tables, because a report that cannot be filed and a block that cannot
 * be recorded are two halves of the same gap. Drop-and-add rather than a new
 * constraint: a CHECK is replaced, not accumulated.
 */
alter table public.content_moderation drop constraint if exists content_moderation_subject_type_check;
alter table public.content_moderation add constraint content_moderation_subject_type_check
  check (subject_type in ('custom_item', 'custom_list', 'custom_tier_row'));

alter table public.content_reports drop constraint if exists content_reports_subject_type_check;
alter table public.content_reports add constraint content_reports_subject_type_check
  check (subject_type in ('custom_item', 'custom_list', 'custom_tier_row', 'post', 'post_comment'));

-- ----------------------------------------------------- what a block means --

/*
 * The tier row's own visibility rule, now consulting the moderation table the
 * way `custom_items` already does.
 *
 * This is the load-bearing half. The storage select policy from 012 decides
 * whether a tier picture may be signed by asking whether any visible tier row
 * points at it — and that subquery runs as the reader, under this policy. So
 * adding the check here is what makes a block reach the picture; the storage
 * policy needs no edit and gets none.
 *
 * Migration 012's own copy of this policy has been updated to match, so
 * re-running it cannot drop the check again.
 */
drop policy if exists "Custom tiers follow their list" on public.custom_tier_rows;
create policy "Custom tiers follow their list"
  on public.custom_tier_rows for select
  using (
    not public.is_blocked('custom_tier_row', id)
    and exists (
      select 1 from public.custom_tier_lists l
      where l.id = list_id and ((l.is_public and l.hidden_at is null) or auth.uid() = l.user_id)
    )
  );

/*
 * Split by command, and the reason is the SELECT that is no longer here.
 *
 * This was one `for all` policy. `for all` includes SELECT, and policies are
 * OR'd — so the owner reached their own tier rows through this rule, which
 * asks only about ownership, rather than through `Custom tiers follow their
 * list`, which is the one that consults the moderation table. A blocked tier
 * was therefore still visible to the person whose board it was on, and the
 * storage read policy resolves a tier picture through whichever rule lets the
 * reader see the row — so the block did not reach the owner's signed url
 * either.
 *
 * Owners lose nothing: the SELECT policy already grants them their own rows
 * via `auth.uid() = l.user_id`. What they lose is the second, unconditional
 * route to the same rows.
 *
 * UPDATE additionally refuses a blocked row, matching `custom_items` and
 * `custom_tier_lists`: a block its subject can edit around is not a block.
 * DELETE deliberately does not — removing the content entirely is not an
 * escape from moderation, and `custom_items` treats it the same way.
 */
drop policy if exists "Owners write their own custom tiers" on public.custom_tier_rows;

drop policy if exists "Owners create their own custom tiers" on public.custom_tier_rows;
create policy "Owners create their own custom tiers"
  on public.custom_tier_rows for insert
  with check (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

drop policy if exists "Owners update their own custom tiers" on public.custom_tier_rows;
create policy "Owners update their own custom tiers"
  on public.custom_tier_rows for update
  using (
    not public.is_blocked('custom_tier_row', id)
    and exists (
      select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
    )
  )
  with check (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

drop policy if exists "Owners delete their own custom tiers" on public.custom_tier_rows;
create policy "Owners delete their own custom tiers"
  on public.custom_tier_rows for delete
  using (exists (
    select 1 from public.custom_tier_lists l where l.id = list_id and auth.uid() = l.user_id
  ));

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_qual text;
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_moderation_subject_type_check'
      and pg_get_constraintdef(oid) like '%custom_tier_row%'
  ) then
    raise exception 'TierListOnline: content_moderation still cannot record a tier-row block.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'content_reports_subject_type_check'
      and pg_get_constraintdef(oid) like '%custom_tier_row%'
  ) then
    raise exception 'TierListOnline: content_reports still cannot accept a tier-row report.';
  end if;

  -- The report types 015 added must have survived the constraint being
  -- replaced above.
  if not exists (
    select 1 from pg_constraint
    where conname = 'content_reports_subject_type_check'
      and pg_get_constraintdef(oid) like '%post_comment%'
  ) then
    raise exception 'TierListOnline: replacing the report constraint dropped the feed subject types from 015.';
  end if;

  select qual into v_qual
  from pg_policies
  where schemaname = 'public' and tablename = 'custom_tier_rows'
    and policyname = 'Custom tiers follow their list';

  if v_qual is null or v_qual not like '%custom_tier_row%' then
    raise exception 'TierListOnline: the tier-row select policy does not consult the moderation table.';
  end if;

  -- content_moderation must still be unreachable from the API. Adding a
  -- subject type must not have come with a way for an owner to write one.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('content_moderation', 'upload_grants')
  ) then
    raise exception 'TierListOnline: content_moderation or upload_grants grew a policy.';
  end if;

  -- The `for all` policy must be gone. It included SELECT, and an OR'd
  -- ownership-only SELECT is a way past the check added above — which is how a
  -- blocked tier stayed visible to its own owner.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'custom_tier_rows' and cmd = 'ALL'
  ) then
    raise exception 'TierListOnline: custom_tier_rows still has a FOR ALL policy — it grants SELECT around the moderation check.';
  end if;

  -- And the three that replace it must all be present, or the board breaks.
  if (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'custom_tier_rows'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  ) <> 3 then
    raise exception 'TierListOnline: the owner write policies on custom_tier_rows are incomplete — tiers could not be created, renamed or removed.';
  end if;

  raise notice 'TierListOnline: a tier picture can now be reported and blocked like any other.';
end $$;

-- ------------------------------------------------------------- operations --
--
-- Take one tier's picture down, leaving the rest of the board alone:
--   insert into public.content_moderation (subject_type, subject_id, note)
--   values ('custom_tier_row', '<tier row id>', 'reported: <why>');
--
-- Read the open reports with what they point at, tier rows included — the
-- board and its owner come back on every row, which is what a decision needs:
--   select r.id, r.subject_type, r.reason, r.created_at, r.reporter_id,
--          coalesce(i.image_path, tr.image_path) as image_path,
--          coalesce(i.list_id, tr.list_id, r.subject_id) as list_id,
--          l.title, l.user_id as owner
--   from public.content_reports r
--   left join public.custom_items i
--          on r.subject_type = 'custom_item' and i.id = r.subject_id
--   left join public.custom_tier_rows tr
--          on r.subject_type = 'custom_tier_row' and tr.id = r.subject_id
--   left join public.custom_tier_lists l
--          on l.id = coalesce(i.list_id, tr.list_id, r.subject_id)
--   where r.status = 'open'
--   order by r.created_at desc;
