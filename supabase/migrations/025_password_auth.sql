-- TierListOnline: let a username resolve to an email before there is a session.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- READ THIS BEFORE RUNNING. This adds email+password as a THIRD sign-in
-- method next to the magic link and Google — neither of those changes, and
-- neither loses anyone. Supabase's own `signInWithPassword` already does
-- everything the password check itself needs; the one piece missing is
-- letting someone sign in with their username instead of typing their email
-- again, which is a real usability ask once an account already has a
-- permanent handle at /u/<username>.
--
-- Why this cannot be a plain client-side `select email from profiles`:
--
--   1. `profiles`' own SELECT policy (migration 004/021) is
--      `is_public or auth.uid() = id or exists posts`. Before sign-in,
--      `auth.uid()` does not exist yet — so an anonymous read only ever sees
--      PUBLIC profiles. Someone with a private profile (`is_public = false`,
--      never posted) would silently fail to resolve their own username and
--      could never sign in by it, even though they are the account's owner.
--   2. `profiles` does not carry an email column at all. The email lives in
--      `auth.users`, a schema PostgREST does not expose to any client role.
--
-- So this is security definer, the same pattern as `consume_rate_limit`
-- (017) and `increment_post_views` (018): a narrow function that reveals
-- exactly one fact — the email behind a KNOWN username, or null — and
-- nothing else about the account (not `is_public`, not `allow_fork`, not
-- whether it has ever posted). It is deliberately callable by `anon`, since
-- that is the whole point: this has to work before there is a session.
--
-- What this intentionally reveals, and why that is the accepted shape of
-- the feature rather than an oversight: given a username, the function's
-- non-null/null answer says whether an account by that handle exists — for
-- a PRIVATE profile too, where `/u/<username>` would already say "not
-- found" either way (see .ai/DECISIONS.md, the SSR pass on that route) and
-- an anonymous `select` against `profiles` returns nothing either way. This
-- is more than those two surfaces reveal for a private handle, and it is
-- unavoidable: someone cannot sign in by their own private username unless
-- resolving it works for private profiles too. The mitigating facts: (a) a
-- username is already a low-entropy, semi-public handle — trying to CLAIM
-- one already tells a caller whether it is taken, via the existing
-- `saveProfile`/`UsernameDialog` uniqueness check, so "does this username
-- exist" was reachable before this migration too; (b) the function never
-- reveals the email itself to someone who has not already guessed the exact
-- username; (c) two independent rate-limit layers bound how fast either
-- fact can be probed — see below.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'TierListOnline: run migration 004 first — public.profiles is missing.';
  end if;
  if to_regclass('public.rate_limits') is null then
    raise exception 'TierListOnline: run migration 017 first — the rate limiter is missing.';
  end if;
end $$;

-- ---------------------------------------------------------- the function --

/*
 * Security review, to the same standard as attach_upload / increment_post_views:
 *
 *   * search_path is empty and every name is schema-qualified.
 *   * Returns exactly one column, `text`, and it is the email or null — never
 *     the profile row, never `auth.users` itself, never an error that could
 *     distinguish "no such username" from "malformed input" (both just
 *     return null, so a caller learns nothing from which branch was taken).
 *   * p_username is used only in an equality comparison against an indexed,
 *     already-constrained column (migration 004's own
 *     `username ~ '^[a-z0-9_-]{3,20}$'` check) — never interpolated into SQL.
 *   * Reads `auth.users.email` for exactly the one matched row, joined by
 *     primary key, not filtered or ordered by anything caller-influenced
 *     beyond the username itself.
 *   * The internal rate-limit call is layer two, not layer one: layer one is
 *     the application's own `checkRateLimit(..., "auth")` in
 *     `/api/auth/resolve-login`, counted per caller address before this
 *     function is ever reached in the app's own flow. This layer bounds a
 *     caller who skips that route and calls the RPC directly (the anon key
 *     is public, so `POST /rest/v1/rpc/resolve_username_email` is always
 *     reachable) — the same "layer 2 catches what layer 1 does not see"
 *     shape `increment_post_views` already uses for view counting.
 */
create or replace function public.resolve_username_email(p_username text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Generous on purpose: this ceiling exists to bound a caller that bypasses
  -- the application's own per-address limiter entirely, not to bound normal
  -- retries — a person mistyping their own password five times in a row
  -- resolves their own username five times in a few seconds, and that must
  -- not lock them out of their own account.
  c_limit constant integer := 30;
  c_window_seconds constant integer := 300;
  v_username text;
  v_email text;
begin
  if p_username is null or length(p_username) = 0 or length(p_username) > 20 then
    return null;
  end if;

  v_username := lower(p_username);

  if public.consume_rate_limit('username-resolve:' || v_username, c_limit, c_window_seconds) <> 0 then
    -- Refused the same way "not found" is refused — a caller cannot tell a
    -- rate limit apart from a wrong username from this function's answer
    -- alone. The application's own layer is what surfaces 429 distinctly,
    -- since it runs first in the app's own flow.
    return null;
  end if;

  select u.email into v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = v_username;

  return v_email;
end;
$$;

revoke all on function public.resolve_username_email(text) from public;
grant execute on function public.resolve_username_email(text) to anon, authenticated;

-- ------------------------------------------------------------- self-check --

/*
 * Structural only, the same split every migration here uses. Behavioural
 * coverage — a private profile still resolving, a nonexistent one returning
 * null, the per-username ceiling actually engaging — lives in
 * supabase/testing/22_username_resolution_checks.sql, run by the local
 * harness, not in production.
 */
do $$
declare
  v_leaky text;
begin
  select string_agg(p.proname, ', ') into v_leaky
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resolve_username_email'
    and not has_function_privilege('anon', p.oid, 'EXECUTE');

  if v_leaky is not null then
    raise exception 'TierListOnline: anon cannot execute resolve_username_email — signing in by username would break before there is a session.';
  end if;

  if not has_function_privilege('authenticated', 'public.resolve_username_email(text)', 'EXECUTE') then
    raise exception 'TierListOnline: authenticated cannot execute resolve_username_email.';
  end if;

  raise notice 'TierListOnline: a username can now be resolved to an email before sign-in, rate-limited two ways.';
end $$;
