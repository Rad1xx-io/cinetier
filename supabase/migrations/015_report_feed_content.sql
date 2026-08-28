-- TierListOnline: let a report point at a feed post or a comment on one, not
-- only a custom board's own content. Run once in the Supabase SQL Editor.
-- Safe to re-run.
--
-- content_reports (012) started as the one signal for something nothing here
-- inspects automatically: a picture somebody should not have uploaded. The
-- community feed (009) has the same gap — a post's title and description, or
-- a comment on it, is read by whoever wrote it and whoever's looking, and
-- there was no way to flag either one. This widens the same table's
-- subject_type check rather than adding a second reports table: a report is
-- one idea regardless of what it points at, and the API route already reads
-- subject_type generically.

do $$
begin
  if to_regclass('public.content_reports') is null then
    raise exception 'TierListOnline: run migration 012 first — public.content_reports is missing.';
  end if;
  if to_regclass('public.posts') is null then
    raise exception 'TierListOnline: run migration 009 first — public.posts is missing.';
  end if;
end $$;

alter table public.content_reports drop constraint if exists content_reports_subject_type_check;
alter table public.content_reports add constraint content_reports_subject_type_check
  check (subject_type in ('custom_item', 'custom_list', 'post', 'post_comment'));
