#!/usr/bin/env bash
# Restore a nightly backup into an EMPTY database.
#   scripts/restore-backup.sh backup-2026-11-15.dump.age age-private-key.txt postgresql://user:pass@host:5432/dbname
# Needs: age, pg_restore (postgresql-client 16). Never point this at the live database.
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <backup.dump.age> <age-private-key-file> <empty-database-url>" >&2
  exit 1
fi
backup="$1"; key="$2"; target="$3"

[ -f "$backup" ] || { echo "Backup file not found: $backup" >&2; exit 1; }
[ -f "$key" ] || { echo "Key file not found: $key" >&2; exit 1; }

dump="$(mktemp)"
trap 'rm -f "$dump"' EXIT
age -d -i "$key" -o "$dump" "$backup"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$target" "$dump"
echo "Restore finished. Now start the API against this database (it will apply any newer migrations)."
