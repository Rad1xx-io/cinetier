-- What migration 026 claims: account_has_password() answers correctly for
-- the caller's own account, distinguishes a password account from a
-- passwordless one, and cannot be used to check anyone else's account or
-- be called at all before there is a session.

\set ON_ERROR_STOP on

\set password_user     'ca000000-3333-4333-8333-000000000001'
\set passwordless_user  'ca000000-3333-4333-8333-000000000002'

-- ------------------------------------------------------------- fixtures ----

begin;

delete from auth.users where id in (:'password_user', :'passwordless_user');

insert into auth.users (id, email, encrypted_password) values
  (:'password_user', 'hasnpw-yes@example.test', '$2a$10$fakehashfakehashfakehashfa'),
  -- Never set one: a Google or magic-link-only account, encrypted_password
  -- is null exactly the way it would be on a real Supabase project.
  (:'passwordless_user', 'hasnpw-no@example.test', null);

select set_config('test.password_user', :'password_user', false);
select set_config('test.passwordless_user', :'passwordless_user', false);

commit;

-- ------------------------------ 1. a password account answers true --------

begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"ca000000-3333-4333-8333-000000000001","role":"authenticated"}';

do $$
declare
  v_has_password boolean;
begin
  select public.account_has_password() into v_has_password;

  if v_has_password is not true then
    raise exception 'CONTROL FAILED: an account with encrypted_password set was reported as passwordless';
  end if;

  raise notice 'CONTROL PASSED: a password account reports true';
end $$;

commit;

-- --------------------------- 2. a passwordless account answers false -------

begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"ca000000-3333-4333-8333-000000000002","role":"authenticated"}';

do $$
declare
  v_has_password boolean;
begin
  select public.account_has_password() into v_has_password;

  if v_has_password is not false then
    raise exception 'CONTROL FAILED: an account that never set a password was reported as having one — change-password would wrongly demand a password that does not exist';
  end if;

  raise notice 'CONTROL PASSED: a passwordless account reports false';
end $$;

commit;

-- ------------------- 3. each account only ever answers for itself ---------
--
-- Not a parameter to abuse — there is not one — but worth pinning directly:
-- switching which account is "current" switches the answer, proving this
-- reads auth.uid() fresh each call rather than something cached or fixed.

begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"ca000000-3333-4333-8333-000000000001","role":"authenticated"}';

do $$
begin
  if public.account_has_password() is not true then
    raise exception 'CONTROL FAILED: the password account''s own answer changed unexpectedly';
  end if;
end $$;

commit;

begin;
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"ca000000-3333-4333-8333-000000000002","role":"authenticated"}';

do $$
begin
  if public.account_has_password() is not false then
    raise exception 'EXPLOIT SUCCEEDED: the passwordless account somehow got the password account''s answer — account_has_password is not scoped to auth.uid() correctly';
  end if;

  raise notice 'BLOCKED: switching accounts switches the answer — each account only ever sees its own';
end $$;

commit;

-- ------------------------- 4. refused before there is a session -----------

begin;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform public.account_has_password();
  raise exception 'EXPLOIT SUCCEEDED: account_has_password answered for an anonymous caller with no session';
exception
  when insufficient_privilege then
    raise notice 'BLOCKED: anon cannot execute account_has_password at all (permission denied)';
  when others then
    -- Reached only if anon somehow could execute it (grants misconfigured
    -- some other way) but auth.uid() was null — the function's own guard.
    if sqlerrm like '%Sign in to check your account%' then
      raise notice 'BLOCKED: account_has_password refuses a null auth.uid() with its own guard';
    else
      raise;
    end if;
end $$;

commit;

-- --------------------------------------------------- the policy text --------

do $$
begin
  if has_function_privilege('anon', 'public.account_has_password()', 'EXECUTE') then
    raise exception 'REGRESSION: anon can execute account_has_password';
  end if;

  if not has_function_privilege('authenticated', 'public.account_has_password()', 'EXECUTE') then
    raise exception 'REGRESSION: authenticated cannot execute account_has_password';
  end if;

  raise notice 'CONFIRMED: account_has_password is authenticated-only, exactly as migration 026 intends';
end $$;
