-- CineTier: allow 'anime' as a media_type on ranked_titles.
-- Run this once in the Supabase project's SQL Editor (Dashboard -> SQL Editor -> New query).
-- Existing rows (movie/tv) are unaffected — this only widens the allowed values.

alter table public.ranked_titles drop constraint if exists ranked_titles_media_type_check;
alter table public.ranked_titles add constraint ranked_titles_media_type_check
  check (media_type in ('movie', 'tv', 'anime'));
