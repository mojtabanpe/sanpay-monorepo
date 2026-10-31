#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
readonly project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly env_file="${project_root}/.env.production"
readonly marker="${project_root}/.deploy/staging-finance-reset.completed"
compose() { docker compose --env-file "${env_file}" -f "${project_root}/compose.production.yml" "$@"; }
usage() {
  echo 'Usage: bash deploy/reset-staging-finance.sh [--apply --confirm-all-data-is-test]'
  echo 'Default: read-only counts. Apply: stop API, verify backup, reset ALL test financial history.'
  echo 'Includes hotel/flight bookings, QR/OTP purchase requests, refunds, reviews and settlements.'
  echo 'Preserves people, stores, admins, wallet definitions and assigned credit limits.'
  echo 'No Toman API is called. The API stays stopped after apply; verify configuration before restarting.'
}
apply=false
if [[ $# -eq 0 ]]; then :
elif [[ $# -eq 1 && "$1" == '--help' ]]; then usage; exit 0
elif [[ $# -eq 2 && "$1" == '--apply' && "$2" == '--confirm-all-data-is-test' ]]; then apply=true
else usage >&2; exit 2; fi
cd "${project_root}"
if [[ "${apply}" == true ]]; then
  mkdir -p "${project_root}/.deploy"
  exec 9>"${project_root}/.deploy/deploy.lock"
  flock -n 9 || { echo 'Deployment/reset already running; try again after it finishes.' >&2; exit 1; }
fi
compose config --quiet
echo 'Financial history selected for deletion (all gateways, all dates):'
compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' <<'SQL'
BEGIN READ ONLY;
SELECT 'Payment' AS entity, count(*) FROM "Payment"
UNION ALL SELECT 'Transaction', count(*) FROM "Transaction"
UNION ALL SELECT 'GatewayPayment', count(*) FROM "GatewayPayment"
UNION ALL SELECT 'GatewayRefund', count(*) FROM "GatewayRefund"
UNION ALL SELECT 'GatewayReview', count(*) FROM "GatewayReview"
UNION ALL SELECT 'PaymentIntent', count(*) FROM "PaymentIntent"
UNION ALL SELECT 'MerchantPaymentIntent', count(*) FROM "MerchantPaymentIntent"
UNION ALL SELECT 'PurchaseCode', count(*) FROM "PurchaseCode"
UNION ALL SELECT 'SettlementBatch', count(*) FROM "SettlementBatch"
UNION ALL SELECT 'SettlementItem', count(*) FROM "SettlementItem"
UNION ALL SELECT 'HotelBooking', count(*) FROM "HotelBooking"
UNION ALL SELECT 'FlightBooking', count(*) FROM "FlightBooking"
UNION ALL SELECT 'FlightQuote', count(*) FROM "FlightQuote"
UNION ALL SELECT 'GdsWebhookEvent', count(*) FROM "GdsWebhookEvent";
SELECT d.kind, count(*) AS wallets, coalesce(sum(a.cap),0) AS cap_toman,
  coalesce(sum(a.spent),0) AS spent_toman
FROM "WalletAllocation" a JOIN "WalletDefinition" d ON d.id=a."definitionId" GROUP BY d.kind;
COMMIT;
SQL
if [[ "${apply}" != true ]]; then
  echo 'Preview only. No changes made. Use --apply --confirm-all-data-is-test to delete all test financial history.'
  exit 0
fi
if [[ -e "${marker}" ]]; then echo "Reset already completed: ${marker}. Refusing a second reset." >&2; exit 1; fi
echo 'Stopping the API for backup and reset. It will remain stopped, including on failure.'
date -u +%FT%TZ > "${project_root}/.deploy/finance-maintenance"
compose stop api
bash "${project_root}/deploy/backup-database.sh"
compose exec -T postgres sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' < "${project_root}/deploy/reset-staging-finance.sql"
mkdir -p "${project_root}/.deploy"
date -u +%FT%TZ > "${marker}"
echo 'Reset committed. API is STOPPED. Verify configuration, then recreate the API.'
echo 'See docs/tomanpay/live-migration-and-diagnostics.md for restart and diagnostics commands.'
