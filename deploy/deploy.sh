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

docker compose --env-file "${env_file}" -f "${compose_file}" config --quiet
docker compose --env-file "${env_file}" -f "${compose_file}" build
# No application container or migration is started until this backup succeeds.
"${project_root}/deploy/backup-database.sh"
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --remove-orphans
# Bind-mounted configuration changes do not recreate the gateway container, and
# `git reset` replaces gateway.conf with a new inode, so a single-file bind mount
# keeps showing the container the old file. Recreate the gateway when its live
# config differs from the checkout; otherwise a reload is enough.
if docker compose --env-file "${env_file}" -f "${compose_file}" exec -T gateway \
  cat /etc/nginx/conf.d/default.conf | cmp -s - "${project_root}/deploy/gateway.conf"; then
  docker compose --env-file "${env_file}" -f "${compose_file}" exec -T gateway nginx -t
  docker compose --env-file "${env_file}" -f "${compose_file}" exec -T gateway nginx -s reload
else
  echo 'Gateway config changed; recreating the gateway container.'
  docker compose --env-file "${env_file}" -f "${compose_file}" up -d --no-deps --force-recreate gateway
  docker compose --env-file "${env_file}" -f "${compose_file}" exec -T gateway nginx -t
fi
docker compose --env-file "${env_file}" -f "${compose_file}" ps
