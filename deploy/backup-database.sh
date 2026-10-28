#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly compose_file="${project_root}/compose.production.yml"
readonly env_file="${project_root}/.env.production"
readonly backup_dir="${SANPAY_BACKUP_DIR:-${project_root}/.deploy/backups}"

compose() {
  docker compose --env-file "${env_file}" -f "${compose_file}" "$@"
}

if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}; database backup was not created." >&2
  exit 1
fi

cd "${project_root}"
compose config --quiet

# Never recreate an existing database container before taking its backup.
postgres_id="$(compose ps --all --quiet postgres)"
if [[ -z "${postgres_id}" ]]; then
  # First installation, or a removed container: reuse the persistent volume.
  compose up -d --no-deps postgres
elif [[ "$(docker inspect --format '{{.State.Running}}' "${postgres_id}")" != "true" ]]; then
  compose start postgres
fi

ready=false
for ((attempt = 0; attempt < 30; attempt++)); do
  if compose exec -T postgres sh -ec 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null'; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "${ready}" != "true" ]]; then
  echo "Database is not ready; deployment must not continue." >&2
  exit 1
fi

mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"
readonly timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
revision="$(git rev-parse --short HEAD 2>/dev/null || printf 'unversioned')"
partial_file="$(mktemp "${backup_dir}/.database-${timestamp}-before-${revision}.XXXXXX")"
cleanup() {
  if [[ -n "${partial_file}" && -f "${partial_file}" ]]; then
    rm -f -- "${partial_file}"
  fi
}
trap cleanup EXIT

echo "Creating a database backup before deployment..."
compose exec -T postgres sh -ec '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' >"${partial_file}"

if [[ ! -s "${partial_file}" ]]; then
  echo "Database backup is empty; deployment must not continue." >&2
  exit 1
fi
# Read every archive section without executing SQL or changing the database.
compose exec -T postgres pg_restore --exit-on-error --file=/dev/null <"${partial_file}"

backup_name="${partial_file##*/}"
readonly backup_file="${backup_dir}/${backup_name#.}.dump"
mv -- "${partial_file}" "${backup_file}"
partial_file=""
echo "Database backup verified: ${backup_file}"
