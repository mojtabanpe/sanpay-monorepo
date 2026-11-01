#!/usr/bin/env bash
# Read-only diagnostics. Never creates a batch, adds items or commits transfers.
set -Eeuo pipefail
umask 077
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-}"
if [[ $# -gt 1 || ( -n "$target" && ! "$target" =~ ^[a-zA-Z0-9_-]{1,100}$ ) ]]; then
  echo 'Usage: bash deploy/inspect-toman-settlements.sh [batch-id|store-id]' >&2
  exit 2
fi
compose() { docker compose --env-file "$project_root/.env.production" -f "$project_root/compose.production.yml" "$@"; }
# to_jsonb keeps this usable before the optional batch tomanStatus migration.
batches="$(compose exec -T -e "SANPAY_DIAGNOSTIC_TARGET=$target" postgres sh -ec '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec psql -X -q -A -t --set=ON_ERROR_STOP=1 --set="target=$SANPAY_DIAGNOSTIC_TARGET" --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"
' <<'SQL'
SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
  SELECT b.id, b.status, b."tomanBatchUuid", to_jsonb(b)->'tomanStatus' AS "tomanStatus",
    b.error, b."submittedAt", b."updatedAt",
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'trackerId',i."trackerId",'status',i.status,'tomanStatus',i."tomanStatus",'error',i.error)), '[]'::jsonb)
      FROM "SettlementItem" i WHERE i."batchId"=b.id) AS items
  FROM "SettlementBatch" b
  WHERE (:'target' <> '' AND (b.id=:'target' OR EXISTS (SELECT 1 FROM "SettlementItem" i WHERE i."batchId"=b.id AND i."storeId"=:'target')))
     OR (:'target' = '' AND b."updatedAt" > now()-interval '72 hours')
  ORDER BY b."updatedAt" DESC LIMIT 10
) x;
SQL
)"
compose exec -T -e "SANPAY_DIAGNOSTIC_BATCHES=$batches" api node --input-type=module < "$project_root/deploy/inspect-toman-settlements.mjs"
echo 'Recent corporate-banking logs (last 72h, at most 150 lines):'
compose logs --no-color --since 72h --tail 20000 api 2>&1 |
  grep -E 'settlement\.|corporate\.|بانکداری شرکتی تومان' |
  { if [[ -n "$target" ]]; then grep -F "$target"; else cat; fi; } |
  tail -150 || true
