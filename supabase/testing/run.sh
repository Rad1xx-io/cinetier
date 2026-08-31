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
[ "${1:-}" = "--negative" ] && { negative=1; DB="cinetier_vuln"; }

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
    009_*|012_*|013_*|014_*|016_*) $PSQL -d "$DB" -f "$migration" > /dev/null ;;
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

for checks in 10_rls_checks.sql 11_publication_checks.sql 12_ranked_title_publication_checks.sql 13_image_path_checks.sql; do
  [ -f "$HERE/$checks" ] || continue
  $PSQL -d "$DB" -f "$HERE/$checks" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE:  //'
done
