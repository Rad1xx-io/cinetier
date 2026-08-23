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
for migration in "$HERE"/../migrations/*.sql; do
  case "$(basename "$migration")" in
    012_*) $PSQL -d "$DB" -f "$migration" > /dev/null ;;
  esac
done

if [ "$negative" = "1" ]; then
  # Puts the holes back, so the checks can be watched failing.
  $PSQL -d "$DB" -f "$HERE/20_negative_control.sql" > /dev/null
  echo "--- negative control: these checks are EXPECTED to fail ---"
  if $PSQL -d "$DB" -f "$HERE/10_rls_checks.sql" 2>&1 | grep -E "SUCCEEDED|NOTICE"; then :; fi
  echo "--- if nothing above says EXPLOIT ... SUCCEEDED, the checks prove nothing ---"
  exit 0
fi

$PSQL -d "$DB" -f "$HERE/10_rls_checks.sql" 2>&1 | grep -E "NOTICE|ERROR" | sed 's/^.*NOTICE:  //'
