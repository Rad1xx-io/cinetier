#!/usr/bin/env bash
# Applies the migrations to a scratch database and runs the row-level security
# checks against them. See README.md in this folder.
#
#   PGBIN=/c/Users/Admin/.local/pgtest/pgsql/bin ./supabase/testing/run.sh
#   ./supabase/testing/run.sh --negative     # expects the checks to FAIL
set -euo pipefail

PGBIN="${PGBIN:-$HOME/.local/pgtest/pgsql/bin}"
PGPORT="${PGPORT:-55432}"
DB="${DB:-cinetier_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL="$PGBIN/psql.exe -h 127.0.0.1 -p $PGPORT -U postgres -v ON_ERROR_STOP=1"

negative=0
fresh=0
[ "${1:-}" = "--negative" ] && { negative=1; DB="cinetier_vuln"; }
[ "${1:-}" = "--fresh" ] && { fresh=1; DB="cinetier_fresh"; }

# --fresh: can this project still be rebuilt from nothing?
#
# Not the same question as "do the checks pass". The harness below replays a
# SUBSET of the migrations onto a stand-in platform schema, which is right for
# testing policies but says nothing about whether a from-scratch rebuild works.
# It did not: 005 and 006 guarded a DROP with
# `to_regclass(...) is not null and not exists (select ...)`, and Postgres plans
# an IF condition as one expression — so the sub-select was planned against a
# table that did not exist yet, which is an error rather than a false. Three
# migrations could not be applied to an empty database, and nobody would have
# found out until they needed to rebuild.
#
# This applies the real schema.sql and then EVERY migration in order.
if [ "$fresh" = "1" ]; then
  $PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
  # Only the platform primitives: auth, storage, the roles and the default
  # privileges.
  #
  # Every application table is dropped from the stub here, `profiles` included.
  # The stub carries abbreviated stand-ins for them — enough columns for the
  # checks that read them — because in normal mode they already exist in
  # production and no migration would recreate them. In fresh mode that is
  # exactly backwards: `create table if not exists` means the stub's short
  # version wins and the real definition never runs, so migration 004's
  # `profiles` silently loses `updated_at` and 011 fails on a column that is
  # present in production. Skipping them lets each table be created by whatever
  # actually owns it — 004 for `profiles`, schema.sql for the two ranked_*.
  #
  # Selected by marker rather than by line number. An earlier version used
  # `sed -n '1,95p'`, which silently started copying the wrong thing the moment
  # a table was added to the stub — and because the failure was a psql exit
  # code inside `set -e`, it aborted the whole script with no output at all.
  awk '
    /^create table if not exists public\.profiles/  { skip = 1 }
    /^grant usage on schema public, auth, storage/  { skip = 0 }
    skip                                            { next }
    /^grant .* on public\.(profiles|ranked_titles|ranked_channels)/ { next }
    { print }
  ' "$HERE/00_platform.sql" > "$HERE/.platform-only.sql"

  if ! $PSQL -d "$DB" -f "$HERE/.platform-only.sql" > /tmp/fresh-platform.log 2>&1; then
    echo "FAIL: the platform stub would not apply"
    grep -iE "ERROR" /tmp/fresh-platform.log | head -2
    rm -f "$HERE/.platform-only.sql"
    exit 1
  fi
  rm -f "$HERE/.platform-only.sql"

  failed=0
  $PSQL -d "$DB" -f "$HERE/../schema.sql" > /dev/null 2>&1 || { echo "FAIL schema.sql"; failed=1; }
  for migration in "$HERE"/../migrations/*.sql; do
    name="$(basename "$migration")"
    if ! $PSQL -d "$DB" -f "$migration" > /tmp/fresh.log 2>&1; then
      echo "FAIL $name"
      grep -iE "ERROR" /tmp/fresh.log | head -1
      failed=1
    fi
  done

  if [ "$failed" = "1" ]; then
    echo "--- a clean rebuild is BROKEN ---"
    exit 1
  fi
  echo "--- every migration applies to an empty database ---"
  exit 0
fi

$PSQL -c "drop database if exists $DB;" -c "create database $DB;" > /dev/null
$PSQL -d "$DB" -f "$HERE/00_platform.sql" > /dev/null
# Only the migrations the checks below actually exercise — 00_platform.sql
# stands in for everything earlier (profiles, auth, storage). This list was
# 012 alone until now, which meant 013 and its own check file
# (11_publication_checks.sql) had never once been run by this script: the
# self-check inside 013 requires 009 first and would have failed the moment
# anyone tried. Add the next migration here when its checks are added, or this
# goes stale exactly the same way again.
for migration in "$HERE"/../migrations/*.sql; do
  case "$(basename "$migration")" in
    004_*|009_*|012_*|013_*|014_*|015_*|016_*|017_*|018_*|019_*|020_*|021_*|022_*|023_*|024_*) $PSQL -d "$DB" -f "$migration" > /dev/null ;;
  esac
done

if [ "$negative" = "1" ]; then
  # Puts the holes back, so the checks can be watched failing.
  $PSQL -d "$DB" -f "$HERE/20_negative_control.sql" > /dev/null
  echo "--- negative control: these checks are EXPECTED to fail ---"
  # Each file separately: the first one aborts on its own exploit, and running
  # them in one psql would stop before the later file was ever reached.
  for checks in 10_rls_checks.sql 13_image_path_checks.sql; do
    echo "  ($checks)"
    if $PSQL -d "$DB" -f "$HERE/$checks" 2>&1 | grep -E "SUCCEEDED"; then :; fi
  done
  echo "--- if nothing above says EXPLOIT ... SUCCEEDED, the checks prove nothing ---"
  exit 0
fi

for checks in 10_rls_checks.sql 11_publication_checks.sql 12_ranked_title_publication_checks.sql 13_image_path_checks.sql 14_post_view_checks.sql 15_cross_list_checks.sql 16_migration_idempotency_checks.sql 17_report_dedup_checks.sql 18_profile_visibility_checks.sql 19_tier_row_moderation_checks.sql 21_custom_board_deletion_checks.sql; do
  [ -f "$HERE/$checks" ] || continue
  $PSQL -d "$DB" -f "$HERE/$checks" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE:  //'
done
