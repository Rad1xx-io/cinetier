-- Migration 031 gave `ranked_titles.tmdb_id` a `source`, so a Steam appid and
-- an IGDB id that happen to be the same number no longer name the same row.
-- See .ai/reports/battle-widget-audit.md for the finding this closes.
--
-- Two things are proven here, in order, because either one failing silently
-- would be worse than not testing at all:
--
--   1. The fix actually fixes the thing it was written for: two games with
--      the same (tmdb_id, media_type) but a different source now coexist as
--      two rows, where the old three-column constraint would have collapsed
--      them into one.
--   2. The fix does not reopen the trap its own migration header warns about:
--      `source` is NOT NULL with a default rather than nullable specifically
--      so movie/tv/anime rows — whose source is always 'native' — keep
--      deduplicating on (user, tmdb_id, media_type) exactly as before. If
--      that had been botched (a nullable `source`, say), this second check is
--      the one that would catch it — a naive test only aimed at the games
--      scenario would pass either way and prove nothing about the trap.
--
-- Everything here runs inside one transaction, rolled back at the end —
-- nothing about production or the reference schema is left behind.

\set ON_ERROR_STOP on

\set gamer 'a1a1a1a1-0000-4000-8000-000000000001'

begin;

delete from public.ranked_titles where user_id = :'gamer';
delete from auth.users where id = :'gamer';
insert into auth.users (id, email) values (:'gamer', 'source-checks@example.test');

-- --------------------------------------------- control 1: games disambiguate --

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
values
  (:'gamer', 233, 'game', 'steam', 'Half-Life 2 (Steam)', 'S', 0, 0, 0),
  (:'gamer', 233, 'game', 'igdb',  'A Different Game (IGDB)', 'A', 1, 0, 0);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001' and tmdb_id = 233 and media_type = 'game';

  if v_count <> 2 then
    raise exception 'CHECK BROKEN: expected two distinct games at the same tmdb_id (one steam, one igdb), found %. The source column is not disambiguating them.', v_count;
  end if;

  raise notice 'CONTROL 1 PASSED: a Steam game and an IGDB game sharing a tmdb_id are stored as two rows, not merged into one.';
end $$;

-- A genuine re-save of the SAME game (same source too) must still update in
-- place, not add a third row — the constraint should narrow identity, not
-- remove it.
insert into public.ranked_titles
  (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
values
  (:'gamer', 233, 'game', 'steam', 'Half-Life 2 (Steam, retiered)', 'B', 0, 0, 1)
on conflict (user_id, tmdb_id, media_type, source) do update
  set title = excluded.title, tier = excluded.tier, updated_at = excluded.updated_at;

do $$
declare
  v_count integer;
  v_title text;
begin
  select count(*) into v_count
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001' and tmdb_id = 233 and media_type = 'game';

  if v_count <> 2 then
    raise exception 'CHECK BROKEN: re-saving the Steam game changed the row count to % (expected 2) — either it stopped updating in place, or it stopped being distinguishable from the IGDB game.', v_count;
  end if;

  select title into v_title
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001' and tmdb_id = 233 and media_type = 'game' and source = 'steam';

  if v_title <> 'Half-Life 2 (Steam, retiered)' then
    raise exception 'CHECK BROKEN: re-saving the Steam game did not update it in place.';
  end if;

  raise notice 'CONTROL 1b PASSED: re-saving one of the two still updates it in place, without touching the other.';
end $$;

-- ------------------------------------- control 2: the NOT NULL trap stays shut --
--
-- The exact scenario the migration's own header warns about: a nullable
-- `source` would make every `null` distinct from every other `null` in the
-- unique index, so two movie rows for the same title would stop
-- deduplicating. Inserted here the same way the app's own upsert does it —
-- naming every column this app's cloud-sync writes except `source`, so a
-- regression to "nullable, no default" fails this exactly the way it would
-- fail in production.

delete from public.ranked_titles where user_id = :'gamer' and media_type = 'movie';

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values
  (:'gamer', 550, 'movie', 'Fight Club', 'S', 0, 0, 0);

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values
  (:'gamer', 550, 'movie', 'Fight Club', 'A', 0, 0, 1)
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
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001' and tmdb_id = 550 and media_type = 'movie';

  if v_count <> 1 then
    raise exception 'CHECK BROKEN: saving the same movie twice produced % rows, not 1 — the NOT NULL / default(''native'') trap the migration header warns about has reopened.', v_count;
  end if;

  select tier, source into v_tier, v_source
  from public.ranked_titles
  where user_id = 'a1a1a1a1-0000-4000-8000-000000000001' and tmdb_id = 550 and media_type = 'movie';

  if v_tier <> 'A' then
    raise exception 'CHECK BROKEN: the second movie insert did not update the first — got tier %, expected A.', v_tier;
  end if;
  if v_source <> 'native' then
    raise exception 'CHECK BROKEN: a movie row has source = %, expected the default ''native''.', v_source;
  end if;

  raise notice 'CONTROL 2 PASSED: two movie inserts naming no source still collapse to one row, defaulted to ''native'' — the nullable-column trap did not reopen.';
end $$;

-- --------------------------------------------- the consistency constraint --

do $$
begin
  begin
    insert into public.ranked_titles
      (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
    values
      ('a1a1a1a1-0000-4000-8000-000000000001', 999, 'game', 'native', 'Should be rejected', 'S', 0, 0, 0);
    raise exception 'CHECK BROKEN: a game row with source = ''native'' was accepted.';
  exception
    when check_violation then
      raise notice 'CONTROL 3a PASSED: a game claiming source = ''native'' is rejected.';
  end;

  begin
    insert into public.ranked_titles
      (user_id, tmdb_id, media_type, source, title, tier, "order", added_at, updated_at)
    values
      ('a1a1a1a1-0000-4000-8000-000000000001', 998, 'movie', 'steam', 'Should be rejected', 'S', 0, 0, 0);
    raise exception 'CHECK BROKEN: a movie row with source = ''steam'' was accepted.';
  exception
    when check_violation then
      raise notice 'CONTROL 3b PASSED: a movie claiming a game source is rejected.';
  end;
end $$;

rollback;
