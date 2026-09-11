-- Group voting (033): the tie-break rule proven against real ballots, not
-- described and trusted, plus the guard rails a session and its ballots
-- depend on. Same discipline as 26/27/28: where a rule could quietly stop
-- doing its job, prove it still does before asserting anything about it.

\set ON_ERROR_STOP on

\set creator '99990001-0000-4000-8000-000000000001'
\set stranger '99990002-0000-4000-8000-000000000002'
\set voter1 '99990003-0000-4000-8000-000000000003'

begin;

delete from public.voting_ballots where session_id in (
  select id from public.voting_sessions where creator_id in (:'creator', :'stranger')
);
delete from public.voting_sessions where creator_id in (:'creator', :'stranger');
delete from public.posts where user_id in (:'creator', :'stranger');
delete from auth.users where id in (:'creator', :'stranger', :'voter1');

insert into auth.users (id, email) values
  (:'creator', 'voting-creator@example.test'),
  (:'stranger', 'voting-stranger@example.test'),
  (:'voter1', 'voting-voter1@example.test');
insert into public.profiles (id, username, display_name) values
  (:'creator', 'voting_creator_check', 'Voting Creator');

commit;

-- ----------------------------------------------- the aggregation itself ----
--
-- One session, four items, chosen to exercise every branch of the rule in
-- the migration's own header: a clean majority, a tie broken by the rest of
-- the room leaning one way, a fully symmetric tie with nothing left in the
-- data to break it, and an item nobody voted on at all.
--
--   item-majority : S,S,S,A               -> S (3 beats 1, no tie at all)
--   item-tiebreak : S,S,A,A + a lone B     -> A (S/A tied 2-2, but the B
--                                             vote pulls the mean toward A)
--   item-symmetric: S,S,F,F, nothing else  -> S (mean is exactly between S
--                                             and F; falls back to the
--                                             better tier, the documented
--                                             last resort)
--   item-novotes  : never appears in a ballot -> Unrated

begin;

insert into public.voting_sessions (id, creator_id, title, description, category, pool)
values (
  '99990001-1111-4000-8000-000000000011',
  :'creator', 'Tie-break proof', '', 'movie',
  '[
    {"itemKey":"item-majority","tmdbId":1,"mediaType":"movie","title":"Majority","posterPath":null,"releaseDate":null},
    {"itemKey":"item-tiebreak","tmdbId":2,"mediaType":"movie","title":"Tiebreak","posterPath":null,"releaseDate":null},
    {"itemKey":"item-symmetric","tmdbId":3,"mediaType":"movie","title":"Symmetric","posterPath":null,"releaseDate":null},
    {"itemKey":"item-novotes","tmdbId":4,"mediaType":"movie","title":"No votes","posterPath":null,"releaseDate":null}
  ]'::jsonb
);

commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99990003-0000-4000-8000-000000000003","role":"authenticated"}';
insert into public.voting_ballots (session_id, user_id, voter_key, ratings) values
  ('99990001-1111-4000-8000-000000000011', :'voter1', 'proof-voter-01',
   '{"item-majority":"S","item-tiebreak":"S","item-symmetric":"S"}');
commit;

begin;
set local role anon;
insert into public.voting_ballots (session_id, voter_key, ratings) values
  ('99990001-1111-4000-8000-000000000011', 'proof-voter-02',
   '{"item-majority":"S","item-tiebreak":"S","item-symmetric":"S","not-in-the-pool":"S"}');
commit;

begin;
set local role anon;
insert into public.voting_ballots (session_id, voter_key, ratings) values
  ('99990001-1111-4000-8000-000000000011', 'proof-voter-03',
   '{"item-majority":"S","item-tiebreak":"A","item-symmetric":"F"}');
commit;

begin;
set local role anon;
insert into public.voting_ballots (session_id, voter_key, ratings) values
  ('99990001-1111-4000-8000-000000000011', 'proof-voter-04',
   '{"item-majority":"A","item-tiebreak":"A","item-symmetric":"F"}');
commit;

begin;
set local role anon;
insert into public.voting_ballots (session_id, voter_key, ratings) values
  ('99990001-1111-4000-8000-000000000011', 'proof-voter-05', '{"item-tiebreak":"B"}');
commit;

do $$
declare
  v_ballot_count integer;
begin
  select count(*) into v_ballot_count
  from public.voting_ballots
  where session_id = '99990001-1111-4000-8000-000000000011';
  if v_ballot_count <> 5 then
    raise exception 'CHECK BROKEN: expected 5 ballots to have landed, found %.', v_ballot_count;
  end if;
  raise notice 'CONTROL PASSED: all 5 ballots landed, including one with an item_key outside the pool.';
end $$;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99990001-0000-4000-8000-000000000001","role":"authenticated"}';
select public.close_voting_session('99990001-1111-4000-8000-000000000011') as proof_post_id \gset
commit;

do $$
declare
  v_snapshot jsonb;
  v_tier text;
begin
  -- Looked up through the session's own result_post_id rather than the
  -- \gset-captured psql variable: psql does not interpolate :'var' inside a
  -- dollar-quoted PL/pgSQL block (found by running this, not assumed), and
  -- the session already carries the one link needed to find its own result.
  select rtp.snapshot into v_snapshot
  from public.ranked_title_publications rtp
  join public.voting_sessions s on s.result_post_id = rtp.post_id
  where s.id = '99990001-1111-4000-8000-000000000011';

  if v_snapshot is null then
    raise exception 'CHECK BROKEN: closing produced no snapshot at all.';
  end if;

  select t ->> 'tier' into v_tier
  from jsonb_array_elements(v_snapshot -> 'titles') t
  where t ->> 'tmdbId' = '1';
  if v_tier is distinct from 'S' then
    raise exception 'FAILED: item-majority (S:3, A:1, no tie) resolved to %, expected S.', v_tier;
  end if;
  raise notice 'PASSED: a clean majority (S:3 vs A:1) resolves to the tier with more votes.';

  select t ->> 'tier' into v_tier
  from jsonb_array_elements(v_snapshot -> 'titles') t
  where t ->> 'tmdbId' = '2';
  if v_tier is distinct from 'A' then
    raise exception 'FAILED: item-tiebreak (S:2, A:2, B:1) resolved to %, expected A — the tie should break toward whichever tied tier the rest of the room (the B vote) leans nearer to, not to S by default.', v_tier;
  end if;
  raise notice 'PASSED: an adjacent-tier tie (S:2/A:2) breaks toward the tier the rest of the room leaned closer to (A), not toward a fixed direction.';

  select t ->> 'tier' into v_tier
  from jsonb_array_elements(v_snapshot -> 'titles') t
  where t ->> 'tmdbId' = '3';
  if v_tier is distinct from 'S' then
    raise exception 'FAILED: item-symmetric (S:2, F:2, nothing else) resolved to %, expected S — a perfectly symmetric split has nothing left in the data to break it, and the documented fallback is the better of the two tiers.', v_tier;
  end if;
  raise notice 'PASSED: a fully symmetric tie (S:2/F:2), with nothing in the data left to break it, falls back to the better tier (S) — the same last-resort convention lib/import/tier-mapping.ts already makes at its own boundary.';

  select t ->> 'tier' into v_tier
  from jsonb_array_elements(v_snapshot -> 'titles') t
  where t ->> 'tmdbId' = '4';
  if v_tier is distinct from 'Unrated' then
    raise exception 'FAILED: item-novotes resolved to %, expected Unrated.', v_tier;
  end if;
  raise notice 'PASSED: an item nobody voted on lands on Unrated, the same state an un-ranked card already carries everywhere else.';

  if v_snapshot -> 'titles' is null or jsonb_array_length(v_snapshot -> 'titles') <> 4 then
    raise exception 'FAILED: the snapshot should carry exactly the 4 pool items, found %.', coalesce(jsonb_array_length(v_snapshot -> 'titles'), -1);
  end if;
  raise notice 'PASSED: the stray "not-in-the-pool" key from one ballot was silently ignored, not counted as a fifth item.';
end $$;

-- ---------------------------------------------------------- guard rails ----

do $$
declare
  v_closed_at timestamptz;
begin
  select closed_at into v_closed_at from public.voting_sessions
  where id = '99990001-1111-4000-8000-000000000011';
  if v_closed_at is null then
    raise exception 'CHECK BROKEN: the session should be closed by now.';
  end if;
  raise notice 'CONTROL PASSED: closing set closed_at.';
end $$;

-- A repeat voter_key on a still-OPEN session is rejected — proven on a
-- second, fresh session so a real unique_violation is what fires, not the
-- closed-session RLS refusal below (both would otherwise look the same from
-- outside a transaction).
begin;
insert into public.voting_sessions (id, creator_id, title, description, category, pool)
values (
  '99990001-2222-4000-8000-000000000021',
  :'creator', 'Duplicate voter_key proof', '', 'movie',
  '[{"itemKey":"item-only","tmdbId":5,"mediaType":"movie","title":"Only","posterPath":null,"releaseDate":null}]'::jsonb
);
commit;

begin;
set local role anon;
insert into public.voting_ballots (session_id, voter_key, ratings) values
  ('99990001-2222-4000-8000-000000000021', 'same-browser-twice', '{"item-only":"S"}');
commit;

do $$
begin
  begin
    insert into public.voting_ballots (session_id, voter_key, ratings) values
      ('99990001-2222-4000-8000-000000000021', 'same-browser-twice', '{"item-only":"F"}');
    raise exception 'CHECK BROKEN: a second ballot from the same (session_id, voter_key) was accepted.';
  exception
    when unique_violation then
      raise notice 'BLOCKED: a repeat voter_key in the same open session is rejected (unique_violation), exactly the anti-abuse ceiling documented in the migration header, no more.';
  end;
end $$;

-- Voting on a CLOSED session is refused by RLS, not merely "allowed but
-- ignored" — the row must never land at all.
do $$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.voting_ballots
  where session_id = '99990001-1111-4000-8000-000000000011';

  begin
    set local role anon;
    insert into public.voting_ballots (session_id, voter_key, ratings) values
      ('99990001-1111-4000-8000-000000000011', 'too-late-to-vote', '{"item-majority":"F"}');
  exception
    when insufficient_privilege then null;
  end;
  reset role;

  select count(*) into v_after from public.voting_ballots
  where session_id = '99990001-1111-4000-8000-000000000011';

  if v_after <> v_before then
    raise exception 'FAILED: a ballot landed on a session that was already closed.';
  end if;
  raise notice 'BLOCKED: a ballot submitted after the session closed never lands.';
end $$;

-- Closing an already-closed session raises, rather than silently
-- re-aggregating and publishing a second post.
do $$
begin
  begin
    perform set_config('request.jwt.claims', '{"sub":"99990001-0000-4000-8000-000000000001","role":"authenticated"}', true);
    set local role authenticated;
    perform public.close_voting_session('99990001-1111-4000-8000-000000000011');
    raise exception 'CHECK BROKEN: closing an already-closed session was allowed to run again.';
  exception
    when others then
      if sqlerrm not like '%already closed%' then
        raise exception 'FAILED: closing twice raised the wrong error: %', sqlerrm;
      end if;
      raise notice 'BLOCKED: closing an already-closed session is refused, not re-run.';
  end;
end $$;

-- Only the creator may close their own session — a stranger, even signed in,
-- may not close someone else's.
do $$
begin
  begin
    perform set_config('request.jwt.claims', '{"sub":"99990002-0000-4000-8000-000000000002","role":"authenticated"}', true);
    set local role authenticated;
    perform public.close_voting_session('99990001-2222-4000-8000-000000000021');
    raise exception 'CHECK BROKEN: a stranger was allowed to close someone else''s session.';
  exception
    when others then
      if sqlerrm not like '%Only the creator%' then
        raise exception 'FAILED: a stranger closing someone else''s session raised the wrong error: %', sqlerrm;
      end if;
      raise notice 'BLOCKED: only the session''s own creator may close it.';
  end;
end $$;

reset role;
