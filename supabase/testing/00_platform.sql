-- The parts of Supabase that migration 012 stands on, recreated locally.
--
-- This is scaffolding, not the thing under test. What is under test is our own
-- policies and functions; these objects only have to behave the way the real
-- ones do where our policies touch them — `auth.uid()` reading the request's
-- claims, `storage.foldername()` splitting a path, and row-level security being
-- switched on over `storage.objects`.
--
-- The grants at the bottom matter more than they look. Without them an exploit
-- would fail with "permission denied for table" and the test would pass while
-- proving nothing about row-level security. Supabase grants these roles full
-- table privileges and lets policies do the deciding, so this does too — which
-- means a denial here is a policy denial and nothing else.

-- Roles live in the cluster, not the database, so a second test database finds
-- them already there. Created only if missing, so this file stays re-runnable.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;

-- Supabase's own shape, trimmed to the columns anything here reads.
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);

-- The real definition reads the request's claims, which is what `set local
-- request.jwt.claims` in a test then drives.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')::text;
$$;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null,
  owner uuid,
  -- Storage computes this after the upload; `attach_upload` reads the size and
  -- the mimetype out of it, so a test has to be able to set both.
  metadata jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;

-- Everything in the path except the file itself, which is how ownership is
-- read off the first segment.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end;
$$;

-- Migration 004's table. Only the columns the migrations under test read
-- are here — 012 checks that it exists, and 009 joins to the handle.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text,
  is_public boolean not null default false,
  allow_fork boolean not null default true,
  donation_url text
);

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select, insert, update, delete on public.profiles to anon, authenticated;

-- Anything 012 creates afterwards gets the same treatment, so no test can be
-- rescued by a missing privilege.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
