-- Migration 032 extended `ranked_titles.source` (031's column, originally for
-- games) to anime, so an AniList id and a MyAnimeList/Jikan id that happen to
-- be the same number no longer name the same row. See .ai/DECISIONS.md,
-- 2026-09-10, for the finding this closes.
--
-- Mirrors 27_ranked_title_source_checks.sql's shape exactly, for the same
-- reason: proving the fix does what it was written for is only half of it —
-- the other half is proving it did not reopen the trap 031's own header
-- warns about (a nullable `source` silently breaking movie/tv dedup), which
-- 032 could just as easily have reopened while widening the CHECK from a
-- binary game/not-game split to a per-media_type CASE.
--
-- Everything here runs inside one transaction, rolled back at the end —
-- nothing about production or the reference schema is left behind.

\set ON_ERROR_STOP on

\set otaku 'a1a1a1a1-0000-4000-8000-000000000002'

begin;

delete from public.ranked_titles where user_id = :'otaku';
delete from auth.users where id = :'otaku';
insert into auth.users (id, email) values (:'otaku', 'anime-source-checks@example.test');

-- -------------------------------------------- control 1: anime disambiguate --

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
values
  (:'otaku', 16498, 'anime', 'anilist', 'Attack on Titan (AniList)', 'S', 0, 0, 0),
  (:'otaku', 16498, 'anime', 'jikan',   'A Different Anime (Jikan)', 'A', 1, 0, 0);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000002' and tmdb_id = 16498 and media_type = 'anime';

  if v_count <> 2 then
    raise exception 'CHECK BROKEN: expected two distinct anime at the same tmdb_id (one anilist, one jikan), found %. The source column is not disambiguating them.', v_count;
  end if;

  raise notice 'CONTROL 1 PASSED: an AniList anime and a Jikan anime sharing a tmdb_id are stored as two rows, not merged into one.';
end $$;

-- A genuine re-save of the SAME anime (same source too) must still update in
-- place, not add a third row.
insert into public.ranked_titles
  (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
values
  (:'otaku', 16498, 'anime', 'anilist', 'Attack on Titan (AniList, retiered)', 'B', 0, 0, 1)
on conflict (user_id, tmdb_id, media_type, source) do update
  set title = excluded.title, tier = excluded.tier, updated_at = excluded.updated_at;

do $$
declare
  v_count integer;
  v_title text;
begin
  select count(*) into v_count
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000002' and tmdb_id = 16498 and media_type = 'anime';

  if v_count <> 2 then
    raise exception 'CHECK BROKEN: re-saving the AniList anime changed the row count to % (expected 2) — either it stopped updating in place, or it stopped being distinguishable from the Jikan anime.', v_count;
  end if;

  select title into v_title
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000002' and tmdb_id = 16498 and media_type = 'anime' and source = 'anilist';

  if v_title <> 'Attack on Titan (AniList, retiered)' then
    raise exception 'CHECK BROKEN: re-saving the AniList anime did not update it in place.';
  end if;

  raise notice 'CONTROL 1b PASSED: re-saving one of the two still updates it in place, without touching the other.';
end $$;

-- ------------------------------------------------- control 2: movie/tv unmoved --
--
-- 27_ranked_title_source_checks.sql already proves the NOT NULL / default
-- trap does not reopen for movies. Repeated here for tv, and specifically
-- alongside an anime row this time — the scenario 032 actually changes,
-- since before it every non-game row (movie, tv, *and* anime) shared one
-- CHECK branch, and after it anime has its own. If splitting that branch out
-- had accidentally loosened movie/tv's own rule, this is where it would show.

delete from public.ranked_titles where user_id = :'otaku' and media_type = 'tv';

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values
  (:'otaku', 1399, 'tv', 'Game of Thrones', 'S', 0, 0, 0);

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values
  (:'otaku', 1399, 'tv', 'Game of Thrones', 'A', 0, 0, 1)
on conflict (user_id, tmdb_id, media_type, source) do update
  set tier = excluded.tier, updated_at = excluded.updated_at;

do $$
declare
  v_count integer;
  v_tier text;
  v_source text;
begin
  select count(*) into v_count
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000002' and tmdb_id = 1399 and media_type = 'tv';

  if v_count <> 1 then
    raise exception 'CHECK BROKEN: saving the same tv show twice produced % rows, not 1 — splitting the media_type CASE reopened the nullable-source-shaped trap for tv.', v_count;
  end if;

  select tier, source into v_tier, v_source
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000002' and tmdb_id = 1399 and media_type = 'tv';

  if v_tier <> 'A' then
    raise exception 'CHECK BROKEN: the second tv insert did not update the first — got tier %, expected A.', v_tier;
  end if;
  if v_source <> 'native' then
    raise exception 'CHECK BROKEN: a tv row has source = %, expected the default ''native''.', v_source;
  end if;

  raise notice 'CONTROL 2 PASSED: two tv inserts naming no source still collapse to one row, defaulted to ''native'' — unaffected by anime joining the CASE.';
end $$;

-- ------------------------------------ control 3: the consistency constraint --
--
-- The two combinations 031's binary check could already catch (game
-- claiming 'native', movie claiming a game source) are covered by
-- 27_ranked_title_source_checks.sql. What 032's CASE rewrite adds is the
-- ability to catch a game and an anime claiming *each other's* source —
-- something the old two-way check structurally could not express, since
-- both 'anilist' and 'steam' were simply "not native" to it.

do $$
begin
  begin
    insert into public.ranked_titles
      (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
    values
      ('a1a1a1a1-0000-4000-8000-000000000002', 997, 'anime', 'native', 'Should be rejected', 'S', 0, 0, 0);
    raise exception 'CHECK BROKEN: an anime row with source = ''native'' was accepted.';
  exception
    when check_violation then
      raise notice 'CONTROL 3a PASSED: an anime claiming source = ''native'' is rejected.';
  end;

  begin
    insert into public.ranked_titles
      (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
    values
      ('a1a1a1a1-0000-4000-8000-000000000002', 996, 'movie', 'anilist', 'Should be rejected', 'S', 0, 0, 0);
    raise exception 'CHECK BROKEN: a movie row with source = ''anilist'' was accepted.';
  exception
    when check_violation then
      raise notice 'CONTROL 3b PASSED: a movie claiming an anime source is rejected.';
  end;

  begin
    insert into public.ranked_titles
      (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
    values
      ('a1a1a1a1-0000-4000-8000-000000000002', 995, 'game', 'anilist', 'Should be rejected', 'S', 0, 0, 0);
    raise exception 'CHECK BROKEN: a game row with source = ''anilist'' was accepted.';
  exception
    when check_violation then
      raise notice 'CONTROL 3c PASSED: a game claiming an anime source is rejected — the old binary check could not express this at all.';
  end;

  begin
    insert into public.ranked_titles
      (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
    values
      ('a1a1a1a1-0000-4000-8000-000000000002', 994, 'anime', 'steam', 'Should be rejected', 'S', 0, 0, 0);
    raise exception 'CHECK BROKEN: an anime row with source = ''steam'' was accepted.';
  exception
    when check_violation then
      raise notice 'CONTROL 3d PASSED: an anime claiming a game source is rejected — the old binary check could not express this either.';
  end;
end $$;

rollback;
