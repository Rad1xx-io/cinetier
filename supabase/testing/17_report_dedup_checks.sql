-- What migration 019 claims: one report per person per thing.
--
-- `content_reports` had no uniqueness of any kind, so the same account could
-- file the same complaint about the same card without limit. Each one writes a
-- row, logs at error level and may fire a webhook at whoever moderates this
-- site — so the cost of the abusive version is a person's attention, which is
-- the one thing this feature spends and cannot buy more of.
--
-- The constraint has to be narrow in both directions, and both directions are
-- checked here. Too wide and it silences the signal the feature exists to
-- collect: several different people objecting to the same picture is the
-- clearest evidence there is. Too narrow and it does nothing.

\set ON_ERROR_STOP on

\set alice 'ff111111-1111-4111-8111-111111111101'
\set bob   'ff111111-1111-4111-8111-111111111102'

\set subject_a 'fa000000-0000-4000-8000-000000000001'
\set subject_b 'fa000000-0000-4000-8000-000000000002'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from public.content_reports;
delete from auth.users where id in (:'alice', :'bob');

insert into auth.users (id, email) values
  (:'alice', 'report-alice@example.test'),
  (:'bob', 'report-bob@example.test');

select set_config('test.subject_a', :'subject_a', false);
select set_config('test.subject_b', :'subject_b', false);

commit;

-- ------------------------------------- 1. control: a report can be filed ----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
  values (auth.uid(), 'custom_item', current_setting('test.subject_a')::uuid, 'This is not their photo.');

  raise notice 'CONTROL PASSED: a report can be filed';
end $$;

commit;

-- --------------------------------- 2. the same person, the same subject -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values (auth.uid(), 'custom_item', current_setting('test.subject_a')::uuid, 'Saying it again, louder.');

    raise exception 'EXPLOIT SUCCEEDED: the same person filed the same report twice';
  exception
    when unique_violation then
      raise notice 'BLOCKED: the same person cannot report the same thing twice';
  end;

  -- Nor by rewording it. The constraint deliberately excludes `reason`, so
  -- changing a word does not mint a fresh report.
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values (auth.uid(), 'custom_item', current_setting('test.subject_a')::uuid, 'Completely different words here.');

    raise exception 'EXPLOIT SUCCEEDED: rewording the reason created a second report';
  exception
    when unique_violation then
      raise notice 'BLOCKED: rewording the reason does not create a second report';
  end;
end $$;

commit;

-- ------------------------- 4. the two things that must still be allowed -----

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  -- A different subject, same person.
  insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
  values (auth.uid(), 'custom_item', current_setting('test.subject_b')::uuid, 'A different picture.');

  -- The same subject id under a different subject type is a different thing:
  -- ids are per-table, so a post and a card can share one.
  insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
  values (auth.uid(), 'post', current_setting('test.subject_a')::uuid, 'A post, not the card.');

  raise notice 'PASSED: one person can still report different things';
end $$;

commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111102","role":"authenticated"}';

do $$
begin
  -- The signal the whole feature exists to collect: somebody else agreeing.
  insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
  values (auth.uid(), 'custom_item', current_setting('test.subject_a')::uuid, 'I saw this too.');

  raise notice 'PASSED: a second person can still report the same thing';
end $$;

commit;

-- ---------------------- a dismissed report cannot be pushed back in either --
--
-- The constraint excludes `status` on purpose. If it did not, a reporter could
-- wait for a moderator to dismiss their complaint and then file it again,
-- which turns "dismissed" into a temporary state the reporter controls.

begin;
update public.content_reports
set status = 'dismissed'
where subject_id = current_setting('test.subject_b')::uuid;
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111101","role":"authenticated"}';

do $$
begin
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values (auth.uid(), 'custom_item', current_setting('test.subject_b')::uuid, 'Reopening this.');

    raise exception 'EXPLOIT SUCCEEDED: a dismissed report was re-filed by the same person';
  exception
    when unique_violation then
      raise notice 'BLOCKED: a dismissed report cannot be re-filed by the same person';
  end;
end $$;

commit;

-- --------------------------------------- the reason limit is the database's --
--
-- The route caps this too, but the route is not the boundary — the CHECK from
-- 012 is, and it is worth knowing it still holds after 019 touched the table.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111102","role":"authenticated"}';

do $$
begin
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values (auth.uid(), 'post', current_setting('test.subject_b')::uuid, repeat('x', 1001));

    raise exception 'EXPLOIT SUCCEEDED: a 1001-character reason was stored';
  exception
    when check_violation then
      raise notice 'BLOCKED: the database refuses a reason over 1000 characters';
  end;
end $$;

rollback;

-- ------------------------------------------------------ nobody else's name --
--
-- The constraint counts per reporter, so it would be worth nothing if a
-- reporter could file under somebody else's id. 012's insert policy is what
-- stops that, restated here because 019 depends on it.

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"ff111111-1111-4111-8111-111111111102","role":"authenticated"}';

do $$
begin
  begin
    insert into public.content_reports (reporter_id, subject_type, subject_id, reason)
    values ('ff111111-1111-4111-8111-111111111101'::uuid, 'post',
            'fa000000-0000-4000-8000-00000000000f'::uuid, 'Filed in Alice''s name.');

    raise exception 'EXPLOIT SUCCEEDED: a report was filed under another account''s id';
  exception
    when insufficient_privilege then
      raise notice 'BLOCKED: a report cannot be filed under another account''s id';
  end;
end $$;

rollback;

do $$
begin
  raise notice 'CONFIRMED: one report per person per subject, and everything else still allowed';
end $$;
