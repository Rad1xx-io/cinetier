-- TierListOnline: Mobile Games (App Store) is a new media_type, with its
-- source disambiguation built in from its first row rather than retrofitted
-- after the fact.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. See .ai/PLAN-nav-and-mobile-games.md (B.1-B.2)
-- for the full reasoning; restated here only where the schema depends on it.
-- Mobile games are a new `media_type`, not a third `source` under `game`:
-- `lib/games/source.ts`'s own `activeGamesSource()` picks ONE active catalog
-- with the other as an id-resolution fallback, never two simultaneously
-- browsable ones — which is exactly what PC vs mobile needs to be, since
-- someone may reasonably rank both at once, not have one stand in for the
-- other. iOS App Store only for now — Android/Google Play was explicitly
-- deferred (no official free API; the unofficial route is scraping, ruled
-- out), and this migration does not touch that decision.
--
-- WHY THIS EXTENDS THE SAME source COLUMN, NOT A NEW ONE — same call 032
-- already made for anime, restated because it applies again: one column, one
-- CHECK naming which sources are legal per media_type, so a movie/tv/anime/
-- game row never carries an inert value in a column meant for a different
-- media type, and the existing uniqueness constraint (user_id, tmdb_id,
-- media_type, source) already covers a new media_type the moment it carries
-- a source at all — checked in 032, still true, no change needed here.
--
-- WHY THIS MIGRATION HAS NO BACKFILL, UNLIKE 031 AND 032. Both of those
-- retrofitted a source onto rows that already existed with none recorded,
-- and both had to accept 'unknown' forever on that older data because there
-- was nothing left to read the real answer back from. Mobile Games has never
-- existed in this schema before this migration — there is no row to
-- backfill, so there is no 'unknown' bucket for it at all. The CHECK below
-- requires exactly 'app_store', not '... or unknown', on purpose: every
-- application code path that can insert a mobile_game row (lib/storage/
-- local-storage-repository.ts, lib/storage/cloud-sync.ts) already stamps it,
-- so a row that somehow arrived without one is a bug worth failing loudly
-- on, not a case worth quietly tolerating.

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

-- ---------------------------------------------------------- media_type -----

alter table public.ranked_titles drop constraint if exists ranked_titles_media_type_check;
alter table public.ranked_titles add constraint ranked_titles_media_type_check
  check (media_type in ('movie', 'tv', 'anime', 'game', 'mobile_game'));

-- ------------------------------------------------------------- source ------

alter table public.ranked_titles drop constraint if exists ranked_titles_source_check;
alter table public.ranked_titles drop constraint if exists ranked_titles_source_media_type_check;

alter table public.ranked_titles add constraint ranked_titles_source_check
  check (source in ('native', 'steam', 'igdb', 'anilist', 'jikan', 'app_store', 'unknown'));

alter table public.ranked_titles add constraint ranked_titles_source_media_type_check
  check (
    case media_type
      when 'movie'       then source = 'native'
      when 'tv'          then source = 'native'
      when 'game'        then source in ('steam', 'igdb', 'unknown')
      when 'anime'       then source in ('anilist', 'jikan', 'unknown')
      when 'mobile_game' then source = 'app_store'
      else false
    end
  );

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_bad_media text;
  v_bad_source text;
  v_wrong_media text;
  v_mobile_games integer;
begin
  select string_agg(id::text, ', ') into v_bad_media
  from public.ranked_titles
  where media_type not in ('movie', 'tv', 'anime', 'game', 'mobile_game');
  if v_bad_media is not null then
    raise exception 'TierListOnline: rows with an invalid media_type: %.', v_bad_media;
  end if;

  select string_agg(id::text, ', ') into v_bad_source
  from public.ranked_titles
  where source not in ('native', 'steam', 'igdb', 'anilist', 'jikan', 'app_store', 'unknown');
  if v_bad_source is not null then
    raise exception 'TierListOnline: rows with an invalid source: %.', v_bad_source;
  end if;

  select string_agg(id::text || ' (' || media_type || ':' || source || ')', ', ')
  into v_wrong_media
  from public.ranked_titles
  where not (
    case media_type
      when 'movie'       then source = 'native'
      when 'tv'          then source = 'native'
      when 'game'        then source in ('steam', 'igdb', 'unknown')
      when 'anime'       then source in ('anilist', 'jikan', 'unknown')
      when 'mobile_game' then source = 'app_store'
      else false
    end
  );
  if v_wrong_media is not null then
    raise exception 'TierListOnline: media_type and source disagree on: %.', v_wrong_media;
  end if;

  select count(*) into v_mobile_games
  from public.ranked_titles
  where media_type = 'mobile_game';

  raise notice 'TierListOnline: ranked_titles accepts mobile_game rows, all requiring source = app_store; % exist so far.', v_mobile_games;
end $$;
