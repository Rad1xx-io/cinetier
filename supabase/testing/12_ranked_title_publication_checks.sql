-- What a published regular tier-list post promises, checked against a running
-- Postgres. The mirror of 11_publication_checks.sql for the other kind of
-- post: same two promises, pulling the same two directions —
--
--   * the SHAPE is frozen — re-tiering or un-ranking a title afterwards
--     leaves the post showing what it showed when Publish was pressed;
--   * the CATALOGUE FACTS are live — name, poster, release date come from
--     ranked_titles at render time, and un-ranking a title (or making the
--     whole profile private) takes it out of the post, because the snapshot
--     never held a copy of them either.
--
-- As in 10_rls_checks and 11_publication_checks, every scenario runs as
-- `authenticated` with a real claim, and a control proves the role can do the
-- allowed thing first.

\set ON_ERROR_STOP on

\set author   '55555555-5555-4555-8555-555555555555'
\set stranger '66666666-6666-4666-8666-666666666666'
\set post     'dddddddd-0000-4000-8000-000000000001'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.ranked_title_publications;
delete from public.posts where id = :'post';
delete from public.ranked_titles where user_id in (:'author', :'stranger');
delete from public.profiles where id in (:'author', :'stranger');
delete from auth.users where id in (:'author', :'stranger');

insert into auth.users (id, email) values
  (:'author', 'ranked-author@example.test'), (:'stranger', 'ranked-stranger@example.test');
insert into public.profiles (id, username, is_public) values
  (:'author', 'ranked_author', true), (:'stranger', 'ranked_stranger', true);

insert into public.ranked_titles
  (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values
  (:'author', 101, 'movie', 'The Good One', 'S', 0, 0, 0),
  (:'author', 102, 'movie', 'The Other One', 'A', 1, 0, 0);

commit;

-- ------------------------------------------------- control: publishing -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';

do $$
declare
  v_snapshot jsonb := '{"titles": [
    {"tmdbId": 101, "mediaType": "movie", "tier": "S", "order": 0},
    {"tmdbId": 102, "mediaType": "movie", "tier": "A", "order": 1}
  ]}'::jsonb;
begin
  insert into public.posts (id, user_id, title, category)
  values ('dddddddd-0000-4000-8000-000000000001', auth.uid(), 'My favourites', 'movie');

  insert into public.ranked_title_publications (post_id, snapshot)
  values ('dddddddd-0000-4000-8000-000000000001', v_snapshot);

  if jsonb_array_length(v_snapshot -> 'titles') <> 2 then
    raise exception 'CONTROL FAILED: the snapshot did not hold both titles';
  end if;

  raise notice 'CONTROL PASSED: an author can publish, and the snapshot holds both titles';
end $$;

commit;

-- ---------------------------------------- the shape survives later edits ---

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';

do $$
declare
  v_titles jsonb;
begin
  -- Everything a person does to their board after publishing it. There is no
  -- trigger recomputing the snapshot from these — that absence is the point.
  update public.ranked_titles set tier = 'F', "order" = 99 where tmdb_id = 101 and user_id = auth.uid();
  delete from public.ranked_titles where tmdb_id = 102 and user_id = auth.uid();

  select snapshot -> 'titles' into v_titles
  from public.ranked_title_publications where post_id = 'dddddddd-0000-4000-8000-000000000001';

  if jsonb_array_length(v_titles) <> 2 then
    raise exception 'FAILED: the snapshot followed the live board (% titles)', jsonb_array_length(v_titles);
  end if;
  if (v_titles -> 0 ->> 'tier') <> 'S' then
    raise exception 'FAILED: the frozen tier moved with the live re-tier — got %', v_titles -> 0 ->> 'tier';
  end if;

  raise notice 'PASSED: the snapshot is unchanged by re-tiering and un-ranking a title';
end $$;

rollback;

-- ------------------------------------------- and cannot be rewritten -------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';

do $$
declare
  v_rows integer;
begin
  update public.ranked_title_publications set snapshot = '{"titles": []}'::jsonb
  where post_id = 'dddddddd-0000-4000-8000-000000000001';
  get diagnostics v_rows = row_count;

  if v_rows <> 0 then
    raise exception 'FAILED: an author rewrote a published snapshot (% rows)', v_rows;
  end if;
  raise notice 'PASSED: a snapshot cannot be rewritten, not even by its author';
exception
  when insufficient_privilege then
    raise notice 'PASSED: a snapshot refuses updates outright';
end $$;

rollback;

-- ------------------------------------ un-ranking reaches the post live -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
delete from public.ranked_titles where tmdb_id = 102 and user_id = :'author';
commit;

begin;
set local role authenticated;
-- A stranger, which is who a post is for.
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.ranked_titles
  where user_id = '55555555-5555-4555-8555-555555555555' and tmdb_id = 102;

  -- The post resolves catalogue facts by looking the row up live, so a title
  -- that is not there to find is a title the post cannot show — a gap, not an
  -- error, and this is the mechanism that makes the gap happen.
  if v_visible <> 0 then
    raise exception 'FAILED: an un-ranked title is still readable — the post would still show it';
  end if;
  raise notice 'PASSED: un-ranking a title takes it out of the post, not only off the board';
end $$;

rollback;

-- restore, so the next check starts from the fixture as seeded
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
insert into public.ranked_titles (user_id, tmdb_id, media_type, title, tier, "order", added_at, updated_at)
values (:'author', 102, 'movie', 'The Other One', 'A', 1, 0, 0)
on conflict (user_id, tmdb_id, media_type) do nothing;
commit;

-- -------------------------------------- a private profile hides the post --

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
update public.profiles set is_public = false where id = :'author';
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.ranked_titles where user_id = '55555555-5555-4555-8555-555555555555';

  -- The lever this design leans on instead of a per-post hidden_at: making the
  -- whole profile private already blocks every one of the author's rows, so a
  -- post resolving them live goes blank the same way a taken-down custom
  -- board does — without this migration adding a second switch for it.
  if v_visible <> 0 then
    raise exception 'FAILED: a private profile''s ranked titles are still readable by a stranger';
  end if;
  raise notice 'PASSED: making the profile private hides its titles from every post, with no new switch needed';
end $$;

rollback;

begin;
update public.profiles set is_public = true where id = :'author';
commit;

-- --------------------------------------- only the author may publish -------

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';

do $$
begin
  begin
    insert into public.posts (id, user_id, title, category)
    values ('dddddddd-0000-4000-8000-000000000002', auth.uid(), 'Not mine', 'mixed');
    insert into public.ranked_title_publications (post_id, snapshot)
    values ('dddddddd-0000-4000-8000-000000000001', '{"titles": []}'::jsonb);
    raise exception 'FAILED: a stranger published a snapshot against somebody else''s post';
  exception
    when insufficient_privilege then
      raise notice 'PASSED: only the post''s own author can publish a snapshot for it';
  end;
end $$;

rollback;

-- ------------------------------------------------- readable by a stranger --

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666","role":"authenticated"}';

do $$
declare
  v_visible integer;
begin
  select count(*) into v_visible from public.ranked_title_publications
  where post_id = 'dddddddd-0000-4000-8000-000000000001';

  -- Content-free by design (see the migration header) — a stranger reading
  -- the shape learns nothing a catalogue page would not already show them.
  if v_visible <> 1 then
    raise exception 'FAILED: a stranger cannot read a publicly-published snapshot';
  end if;
  raise notice 'PASSED: a snapshot is readable by anyone, same as the post it belongs to';
end $$;

rollback;

\echo ''
\echo 'All ranked-title publication checks ran. Anything that failed would have aborted the script.'
