-- TierListOnline: give a ranked anime's numeric id a source, so an AniList id
-- and a MyAnimeList/Jikan id can no longer collide under one identity.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. The same class of problem migration 031 closed
-- for games exists for anime, surfaced while diagnosing the 2026-09-08
-- AniList outage (that outage is external and already resolved separately —
-- unrelated to this migration, which only closes the id-collision risk the
-- diagnosis happened to turn up along the way). `lib/anime-sources/index.ts`'s
-- own comment already named it: AniList ids and MyAnimeList ids are two
-- different numbering schemes that happen to agree for older titles (AniList
-- seeded its catalogue from MyAnimeList) but not for anything added since.
-- `jikan-adapter.ts`'s `mapJikanToSummary` goes further — "Deliberately a MAL
-- id in a field named for AniList" — confirming in code that the same bare
-- `tmdb_id` already means two different things depending on which catalogue
-- answered, exactly as it did for games before 031. Live production data was
-- measured 2026-09-08, not assumed: roughly 17 anime rows across 3 users,
-- most with ids in the range AniList's own catalogue only reached well after
-- its MyAnimeList import — the range most likely to collide.
--
-- WHAT THIS DOES NOT DO, same discipline as 031: it does not retroactively
-- decide where an existing anime row's id came from. There has never been a
-- column recording that, so there is nothing to read it back from. Every
-- existing anime row gets source = 'unknown' and stays exactly as ambiguous
-- as it already was — every one of them currently reads 'native', 031's own
-- blanket default for "not a game", which was correct for movie/tv but never
-- was for anime.
--
-- WHY THIS EXTENDS THE SAME COLUMN RATHER THAN ADDING A SECOND ONE. `source`
-- already exists, is already NOT NULL, and already carries the uniqueness
-- constraint every media type relies on for deduplication — a second column
-- (say, `anime_source`) would mean two parallel not-null-with-a-default
-- columns to keep in sync, and a game row would need an inert value in a
-- column that means nothing for it. One column, one CHECK that already knows
-- which values belong to which media_type, is the same shape 031 chose for
-- 'native' vs the two game sources — just with a third bucket added.
--
-- WHY THE MEDIA-TYPE CONSISTENCY CHECK IS REWRITTEN, NOT EXTENDED. 031's
-- version was a single boolean: (media_type = 'game') = (source <> 'native').
-- That only had two buckets to keep apart, which is all it needed at the
-- time. A third ambiguous media type does not fit a two-way check: 'anilist'
-- would satisfy "source <> native" on a GAME row exactly as wrongly as on a
-- genuine anime row, and the old check would never notice — it only ever
-- asked "is this native or not", never "is this the *right kind* of not
-- native". Rewritten as one CASE per media_type, naming exactly which
-- sources are valid for each. This is also strictly stronger than what it
-- replaces: it now also rejects a game row claiming an anime source and an
-- anime row claiming a game source, not only either one claiming 'native' —
-- a class of mistake the old constraint had no way to catch at all.
--
-- The uniqueness constraint itself (`ranked_titles_source_uniqueness`, on
-- `user_id, tmdb_id, media_type, source`) needs no change — checked, not
-- assumed: it was already written against `source` in general, not against
-- game's two values specifically, so anime rows are covered by it the moment
-- they carry a differentiated source, which is what this migration gives them.

do $$
begin
  if to_regclass('public.ranked_titles') is null then
    raise exception 'TierListOnline: run supabase/schema.sql first — ranked_titles is missing.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ranked_titles' and column_name = 'source'
  ) then
    raise exception 'TierListOnline: run migration 031 first — ranked_titles.source does not exist yet.';
  end if;
end $$;

-- ---------------------------------------------------- constraints, dropped --
--
-- Dropped before the backfill below, not after. Unlike 031 — which added
-- `source` as a brand-new, unconstrained column and only attached its CHECKs
-- once the data underneath was already correct — this migration tightens a
-- CHECK that has been live since 031. The backfill's whole job is to move an
-- existing anime row from 'native' to 'unknown', and 031's original
-- constraint (`(media_type = 'game') = (source <> 'native')`) requires every
-- non-game row, anime included, to *stay* 'native' — so run in the other
-- order, the very next line would violate the constraint it is trying to
-- correct data for. Caught locally against a reproduction of real production
-- data before this shipped, not found in production itself.

alter table public.ranked_titles drop constraint if exists ranked_titles_source_check;
alter table public.ranked_titles drop constraint if exists ranked_titles_source_media_type_check;

-- ------------------------------------------------------------ backfill -----

update public.ranked_titles
set source = 'unknown'
where media_type = 'anime' and source = 'native';

-- ------------------------------------------------------------- constraints --

alter table public.ranked_titles add constraint ranked_titles_source_check
  check (source in ('native', 'steam', 'igdb', 'anilist', 'jikan', 'unknown'));

alter table public.ranked_titles add constraint ranked_titles_source_media_type_check
  check (
    case media_type
      when 'movie' then source = 'native'
      when 'tv'    then source = 'native'
      when 'game'  then source in ('steam', 'igdb', 'unknown')
      when 'anime' then source in ('anilist', 'jikan', 'unknown')
      else false
    end
  );

-- ------------------------------------------------------------- self-check --
--
-- Written against every row in the table again, not against the ones this
-- migration happens to touch — the same reason 031's own self-check did the
-- same: the point is the state of the database afterwards.

do $$
declare
  v_bad_source text;
  v_wrong_media text;
  v_unknown_anime integer;
  v_native_anime integer;
begin
  select string_agg(id::text, ', ') into v_bad_source
  from public.ranked_titles
  where source not in ('native', 'steam', 'igdb', 'anilist', 'jikan', 'unknown');
  if v_bad_source is not null then
    raise exception 'TierListOnline: rows with an invalid source: %.', v_bad_source;
  end if;

  select string_agg(id::text || ' (' || media_type || ':' || source || ')', ', ')
  into v_wrong_media
  from public.ranked_titles
  where not (
    case media_type
      when 'movie' then source = 'native'
      when 'tv'    then source = 'native'
      when 'game'  then source in ('steam', 'igdb', 'unknown')
      when 'anime' then source in ('anilist', 'jikan', 'unknown')
      else false
    end
  );
  if v_wrong_media is not null then
    raise exception 'TierListOnline: media_type and source disagree on: %.', v_wrong_media;
  end if;

  select count(*) into v_native_anime
  from public.ranked_titles
  where media_type = 'anime' and source = 'native';
  if v_native_anime > 0 then
    raise exception 'TierListOnline: % anime row(s) still read source = ''native'' — the backfill above did not run or did not cover them.', v_native_anime;
  end if;

  select count(*) into v_unknown_anime
  from public.ranked_titles
  where media_type = 'anime' and source = 'unknown';

  raise notice 'TierListOnline: every ranked_titles row still has a valid source; % existing anime row(s) marked unknown, left that way on purpose.', v_unknown_anime;
end $$;
