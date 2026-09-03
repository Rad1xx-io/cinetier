-- TierListOnline: tell whether the signed-in account has a password at all.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. Changing a password needs to ask for the
-- current one first — but only when there is one to ask for. An account
-- that arrived through Google or a magic link has never set a password,
-- and "change password" for that account is really "set your first
-- password", which cannot demand something that does not exist yet.
--
-- The obvious shortcut — read `user.app_metadata.provider` or
-- `user.identities` client-side and guess from that — is exactly the
-- signal this codebase already found unreliable for a related question.
-- `lib/analytics/signup.ts`'s `signupMethod()` (see its own comment, and
-- the 2026-09-03 password-auth report) discovered that Supabase reports a
-- magic-link account and a password account under the identical
-- `app_metadata.provider === "email"` — there is nothing in that field
-- that distinguishes "has a password" from "has never set one". Reusing
-- it here would silently mislabel exactly the accounts this function
-- exists to get right.
--
-- The real answer lives in `auth.users.encrypted_password` — null for an
-- account that has never set a password, set otherwise — and PostgREST
-- exposes neither `auth.users` nor that column to any client role. This
-- function is the narrow read that closes the gap: no argument at all,
-- keyed off `auth.uid()` internally, so it can only ever answer for the
-- caller's own account. That is what makes it structurally safe to grant
-- to `authenticated` — there is no parameter for a caller to substitute
-- someone else's id into, unlike `resolve_username_email` (025), which
-- takes a username specifically because it has to work before there is a
-- session at all. This one has no before-session use case, so it is not
-- granted to `anon`.

do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'TierListOnline: auth.users is missing — this should not be possible on a real Supabase project.';
  end if;
end $$;

-- ---------------------------------------------------------- the function --

/*
 * Security review, to the same standard as resolve_username_email:
 *
 *   * search_path is empty and every name is schema-qualified.
 *   * Takes no argument — the only account this can ever answer about is
 *     auth.uid()'s own, so there is nothing for a caller to probe.
 *   * Returns a single boolean, nothing else about the account.
 *   * stable, not volatile: a pure read with no side effect, unlike
 *     resolve_username_email's own rate-limit write.
 */
create or replace function public.account_has_password()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in to check your account.' using errcode = '42501';
  end if;

  return exists (
    select 1 from auth.users u
    where u.id = v_user and u.encrypted_password is not null
  );
end;
$$;

revoke all on function public.account_has_password() from public;
grant execute on function public.account_has_password() to authenticated;
-- Same reasoning as migration 023: `revoke all … from public` does not
-- touch `anon`'s default-privilege grant, so this has to be explicit.
-- There is no before-session use case for this function — every caller
-- must already have their own account to ask about.
revoke execute on function public.account_has_password() from anon;

-- ------------------------------------------------------------- self-check --

/*
 * Structural only, the same split every migration here uses. Behavioural
 * coverage — a password account answering true, a passwordless one
 * answering false, and that it can only ever answer for the caller's own
 * account — lives in supabase/testing/23_account_has_password_checks.sql,
 * run by the local harness, not in production.
 */
do $$
declare
  v_leaky text;
begin
  select string_agg(p.proname, ', ') into v_leaky
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'account_has_password'
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_leaky is not null then
    raise exception 'TierListOnline: anon can execute account_has_password — it should only ever be reachable by a signed-in account.';
  end if;

  if not has_function_privilege('authenticated', 'public.account_has_password()', 'EXECUTE') then
    raise exception 'TierListOnline: authenticated cannot execute account_has_password — change-password could never tell whether to ask for the current one.';
  end if;

  raise notice 'TierListOnline: a signed-in account can now check whether it has a password at all, and only its own.';
end $$;
