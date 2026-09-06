-- TierListOnline: give a ranked game's numeric id a source, so a Steam appid
-- and an IGDB id can no longer collide under one identity.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. Finding from .ai/reports/battle-widget-audit.md,
-- led with as the audit's most concrete result. `lib/games/source.ts` already
-- half-documented the problem in its own comment on `getGameDetails`: this
-- project's games catalog has run on two different providers over time —
-- Steam appids, then IGDB ids — and "the two id spaces do overlap
-- numerically". That comment was written for one lookup path. It is not
-- contained there: the same bare `tmdb_id`, with nothing anywhere recording
-- which catalog it came from, is what `ranked_titles`' own uniqueness,
-- `lib/storage/cloud-sync.ts`'s upsert conflict target, a battle's item id,
-- and a widget's render key all use to mean "this game". Live production
-- data was checked, not assumed: a real 22-game board's stored ids are small
-- numbers (71, 72, 122, 233, 472, 495, 529, 732 among them) — precisely the
-- range where an old Steam appid and a current IGDB id are most likely to
-- land on the same number, since both catalogs handed out low ids to old,
-- popular, frequently-ranked titles first.
--
-- WHAT THIS DOES NOT DO. It does not retroactively decide where an existing
-- game row's `tmdb_id` came from. There has never been a column recording
-- that, so there is nothing to read it back from — a rule like "small numbers
-- are probably Steam" would just be a second unverifiable claim standing in
-- for the first. Every existing game row gets `source = 'unknown'` and is left
-- exactly as ambiguous as it already was. What changes is that a *new* game,
-- ranked from this point on, always carries the source that actually served
-- it (`lib/games/source.ts`'s `discoverGames`/`getGameDetails` now stamp
-- every result), so the ambiguity this migration cannot undo also cannot grow.
--
-- WHY `source` IS `NOT NULL` ON EVERY ROW, NOT JUST GAMES. The obvious shape
-- is a nullable column, populated for games and left null for movie/tv/anime,
-- which were never ambiguous. That shape is a trap: Postgres treats every
-- `null` in a unique index as distinct from every other `null`, so the moment
-- a nullable `source` joined the unique constraint, every movie/tv/anime row
-- — whose `source` would all be null — would stop deduplicating against each
-- other, and `lib/storage/cloud-sync.ts`'s upsert would start inserting
-- duplicates instead of updating the existing row, silently, for three of the
-- four media types this app ranks. `source = 'native'` for movie/tv/anime
-- costs one more value in a CHECK constraint and keeps the constraint meaning
-- exactly what it already means for those three. `27_ranked_title_source_checks.sql`
-- proves this specific trap does not reopen, the same "prove the detector
-- catches it" shape as `26_table_privilege_checks.sql`.

do $$
begin
  if to_regclass('public.ranked_titles') is null then
    raise exception 'TierListOnline: run supabase/schema.sql first — ranked_titles is missing.';
  end if;
end $$;

-- ---------------------------------------------------------------- column ----

alter table public.ranked_titles add column if not exists source text;

-- Movie/tv/anime are a fact, not a guess — see the header. Existing game rows
-- get 'unknown' for the same reason.
update public.ranked_titles
set source = case when media_type = 'game' then 'unknown' else 'native' end
where source is null;

alter table public.ranked_titles alter column source set not null;

-- So that every existing insert/upsert this app or its tests already write
-- for movie/tv/anime — none of which mention `source`, because it did not
-- exist when they were written — keeps landing on the one value that has
-- always been correct for those three media types, without editing every
-- call site that builds a `ranked_titles` row.
alter table public.ranked_titles alter column source set default 'native';

alter table public.ranked_titles drop constraint if exists ranked_titles_source_check;
alter table public.ranked_titles add constraint ranked_titles_source_check
  check (source in ('native', 'steam', 'igdb', 'unknown'));

-- A movie/tv/anime row can never claim a game source, and a game row can
-- never claim 'native' — including through the default above, which only
-- ever fires for a row nobody supplied a source for, and a caller inserting a
-- game without one is exactly the mistake this exists to catch rather than
-- paper over with a wrong-but-valid-looking value.
alter table public.ranked_titles drop constraint if exists ranked_titles_source_media_type_check;
alter table public.ranked_titles add constraint ranked_titles_source_media_type_check
  check ((media_type = 'game') = (source <> 'native'));

-- -------------------------------------------------------- the constraint ----
--
-- Looked up by its columns rather than a guessed name: `schema.sql` never
-- named this constraint (a bare `unique (user_id, tmdb_id, media_type)`), so
-- Postgres chose its name, and hand-copying that choice into a migration
-- meant to run against real production is exactly the kind of thing worth
-- discovering instead of assuming.

do $$
declare
  v_old_constraint text;
begin
  select con.conname into v_old_constraint
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'ranked_titles'
    and con.contype = 'u'
    and (
      select array_agg(a.attname::text order by a.attname)
      from pg_attribute a
      where a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    ) = array['media_type', 'tmdb_id', 'user_id'];

  if v_old_constraint is not null then
    execute format('alter table public.ranked_titles drop constraint %I', v_old_constraint);
  end if;
end $$;

alter table public.ranked_titles drop constraint if exists ranked_titles_source_uniqueness;
alter table public.ranked_titles add constraint ranked_titles_source_uniqueness
  unique (user_id, tmdb_id, media_type, source);

-- ------------------------------------------------------------- self-check --

do $$
declare
  v_bad_source text;
  v_wrong_native text;
  v_constraint_cols text[];
  v_unknown_games integer;
begin
  select string_agg(id::text, ', ') into v_bad_source
  from public.ranked_titles
  where source not in ('native', 'steam', 'igdb', 'unknown');
  if v_bad_source is not null then
    raise exception 'TierListOnline: rows with an invalid source: %.', v_bad_source;
  end if;

  select string_agg(id::text || ' (' || media_type || ':' || source || ')', ', ')
  into v_wrong_native
  from public.ranked_titles
  where (media_type = 'game') = (source = 'native');
  if v_wrong_native is not null then
    raise exception 'TierListOnline: media_type and source disagree on: %.', v_wrong_native;
  end if;

  select array_agg(a.attname::text order by a.attname) into v_constraint_cols
  from pg_constraint con
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
  where con.conrelid = 'public.ranked_titles'::regclass
    and con.conname = 'ranked_titles_source_uniqueness';
  if v_constraint_cols is distinct from array['media_type', 'source', 'tmdb_id', 'user_id'] then
    raise exception 'TierListOnline: ranked_titles_source_uniqueness covers %, not the expected four columns.', v_constraint_cols;
  end if;

  select count(*) into v_unknown_games
  from public.ranked_titles
  where media_type = 'game' and source = 'unknown';

  raise notice 'TierListOnline: every ranked_titles row has a source; % existing game row(s) marked unknown, left that way on purpose.', v_unknown_games;
end $$;
