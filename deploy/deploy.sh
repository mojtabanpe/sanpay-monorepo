#!/usr/bin/env bash
set -Eeuo pipefail

readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly compose_file="${project_root}/compose.production.yml"
readonly env_file="${project_root}/.env.production"

if [[ ! -f "${env_file}" ]]; then
  echo "Missing ${env_file}. Copy .env.production.example and fill in real values." >&2
  exit 1
fi

cd "${project_root}"

docker compose --env-file "${env_file}" -f "${compose_file}" config --quiet
docker compose --env-file "${env_file}" -f "${compose_file}" build
docker compose --env-file "${env_file}" -f "${compose_file}" up -d --remove-orphans
docker compose --env-file "${env_file}" -f "${compose_file}" ps
