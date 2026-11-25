#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly compose_file="${project_root}/compose.production.yml"
readonly env_file="${project_root}/.env.production"

if [[ -e "${project_root}/.deploy/finance-maintenance" ]]; then
  echo 'Finance migration maintenance is active; deployment blocked.' >&2
  exit 1
fi

if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}. Copy .env.production.example and fill in real values." >&2
  exit 1
fi

cd "${project_root}"

GATEWAY_CONFIG_HASH="$(sha256sum deploy/gateway.conf.template | cut -c1-16)"
export GATEWAY_CONFIG_HASH

docker compose --env-file "${env_file}" -f "${compose_file}" config --quiet
docker compose --env-file "${env_file}" -f "${compose_file}" build
# No application container or migration is started until this backup succeeds.
"${project_root}/deploy/backup-database.sh"
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --remove-orphans
# The gateway renders its config from deploy/gateway.conf.template at start.
# `up -d` recreates it when its hostnames (.env.production) or this checksum
# change; a plain reload is not enough, because `git reset` replaces the
# template with a new inode that a single-file bind mount does not follow.
docker compose --env-file "${env_file}" -f "${compose_file}" exec -T gateway nginx -t
docker compose --env-file "${env_file}" -f "${compose_file}" exec -T gateway nginx -s reload
docker compose --env-file "${env_file}" -f "${compose_file}" ps
