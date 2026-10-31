#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose() { docker compose --env-file "${project_root}/.env.production" -f "${project_root}/compose.production.yml" "$@"; }
if [[ $# -gt 1 || ( $# -eq 1 && ! "$1" =~ ^[a-zA-Z0-9_-]{1,100}$ ) ]]; then
  echo 'Usage: bash deploy/collect-toman-diagnostics.sh [payment-id|intent-id|tracker-id|batch-id|store-id]' >&2
  exit 2
fi
readonly target="${1:-}"
readonly output_dir="${project_root}/.deploy/diagnostics"
mkdir -p "${output_dir}"
readonly work_dir="$(mktemp -d "${output_dir}/toman-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX")"
trap 'rm -rf -- "${work_dir}"' EXIT
mkdir -p "${work_dir}/logs"
date -u +%FT%TZ > "${work_dir}/collected-at-utc.txt"
git -C "${project_root}" rev-parse HEAD > "${work_dir}/revision.txt" 2>/dev/null || true
printf '%s\n' "${target}" > "${work_dir}/target.txt"
# Explicit allowlist, never dump env, raw HTTP, IBAN, phone, card or credentials.
if ! compose exec -T api node - > "${work_dir}/configuration.json" <<'JS'
const e=process.env;
const keys=['NODE_ENV','TOMAN_MODE','TOMAN_SETTLEMENTS_ENABLED','TOMAN_API_URL','TOMAN_AUTH_URL','TOMAN_TIMEOUT_MS','TOMAN_IPG_MODE','TOMAN_IPG_URL','TOMAN_IPG_AUTH_URL','TOMAN_IPG_TIMEOUT_MS','UPG_GATEWAYS','UPG_STRATEGY'];
const result=Object.fromEntries(keys.map(k=>[k,e[k]??null]));
for (const k of keys.filter(k=>k.endsWith('_URL'))) {
  if (result[k]) { const u=new URL(result[k]); result[k]=u.origin+u.pathname; }
}
for (const prefix of ['TOMAN_','TOMAN_IPG_']) {
  result[prefix+'CREDENTIALS_COMPLETE']=['USERNAME','PASSWORD','CLIENT_ID','CLIENT_SECRET'].every(k=>!!e[prefix+k]);
}
console.log(JSON.stringify(result,null,2));
JS
then echo 'API unavailable; use the last configuration.* events in logs.' > "${work_dir}/configuration-unavailable.txt"; fi
compose exec -T -e "SANPAY_DIAGNOSTIC_TARGET=${target}" postgres sh -ec '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec psql -X -q --set=ON_ERROR_STOP=1 --set="target=$SANPAY_DIAGNOSTIC_TARGET" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' < "${project_root}/deploy/toman-diagnostics.sql" > "${work_dir}/database.jsonl"
if [[ -d "${project_root}/.deploy/toman-logs" ]]; then
  find "${project_root}/.deploy/toman-logs" -type f -name 'toman-*.jsonl' -mtime -7 -exec cp {} "${work_dir}/logs/" \;
fi
if [[ -z "$(find "${work_dir}/logs" -type f -print -quit)" ]]; then
  echo 'No persistent Toman logs from the past seven days. Verify TOMAN_LOG_DIR and API deployment.' > "${work_dir}/logs-unavailable.txt"
fi
readonly archive="${work_dir}.tar.gz"
tar -czf "${archive}" -C "${work_dir}" .
echo "Diagnostics collected: ${archive}"
