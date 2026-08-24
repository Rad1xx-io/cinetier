# Testing the database rules

Row-level security is the only thing standing between one person's board and
everyone else's, and it is written in SQL, not in TypeScript. `npm test` cannot
reach it. This folder runs the policies against a real PostgreSQL server.

**Nothing here touches production.** It runs against a local cluster on
`127.0.0.1:55432` with its own data directory, and every script begins by
dropping and recreating a scratch database. No production URL, key or hostname
appears in this folder, and the local cluster has no route to Supabase.

## Why not `supabase start`

That would be the better answer — the real Auth and Storage services rather
than the stand-ins in `00_platform.sql`. It needs Docker, and Docker on Windows
needs WSL2 or Hyper-V, which need administrator rights and a reboot; Hyper-V is
not available on Windows Home at all. So this uses PostgreSQL's own portable
Windows binaries, which unzip into a user directory and need no installer.

The consequence, stated plainly: `auth.users`, `auth.uid()`, `storage.objects`
and `storage.foldername()` are recreated locally to match Supabase's
definitions. They are scaffolding. What is under test is our policies and
functions, which are applied verbatim from `supabase/migrations`.

## One-time setup

```bash
mkdir -p ~/.local/pgtest && cd ~/.local/pgtest
curl -L -o pg.zip https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip
unzip -q pg.zip
./pgsql/bin/initdb.exe -D data -U postgres -A trust -E UTF8 --locale=C
./pgsql/bin/pg_ctl.exe -D data -l server.log -o "-p 55432 -c listen_addresses=127.0.0.1" start
```

`trust` authentication is fine here and only here: the server listens on
loopback, holds nothing but scratch data, and is thrown away by deleting the
folder.

Starting it again later is the last line on its own. Stopping it:

```bash
~/.local/pgtest/pgsql/bin/pg_ctl.exe -D ~/.local/pgtest/data stop
```

## Running the checks

```bash
./supabase/testing/run.sh
```

Every line should say `PASSED`, `BLOCKED` or `CONFIRMED`. Anything else, and
the script exits non-zero.

## Running the negative control — do this too

```bash
./supabase/testing/run.sh --negative
```

This reinstates the two holes found in review and expects the checks to
**fail**. A green suite means nothing until it has been seen going red for the
reason it claims to test, and this is not a hypothetical worry here: the first
draft of the moderation check passed against a database with the hole wide
open, because it looked up an id from a session that could not see it and then
updated `where id = null`. The negative control is what caught that.

## What is in here

| file | what it is |
| --- | --- |
| `00_platform.sql` | The Supabase surface — roles, `auth`, `storage`, and the grants that make a refusal mean row-level security rather than a missing privilege |
| `10_rls_checks.sql` | The checks: a control, the two exploits from review, and the rules around upload grants |
| `20_negative_control.sql` | Puts the holes back |
| `run.sh` | Applies everything to a scratch database and runs it |

## Adding a check

Write it as a transaction that switches to the `authenticated` role and sets
`request.jwt.claims`, because that is what a browser client is. Then make sure
of two things: that an allowed version of the same action succeeds somewhere in
the file, and that the check fails when the rule it tests is removed.

Note that psql does not substitute `:variables` inside `$$ … $$`. Pass values
in through a session setting and read them with `current_setting()`.
