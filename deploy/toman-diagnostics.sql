\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object('snapshotAt', now(), 'databaseTimeZone', current_setting('TimeZone'));
SELECT json_build_object('gatewayCounts', (SELECT json_agg(r) FROM (
 SELECT gateway,status,count(*) FROM "GatewayPayment" GROUP BY gateway,status
) r), 'settlementCounts', (SELECT json_agg(r) FROM (
 SELECT status,count(*) FROM "SettlementBatch" GROUP BY status
) r));
SELECT json_build_object('payments', (SELECT json_agg(r) FROM (
 SELECT id,"intentId",gateway,"trackerId",ref,amount::text,status,
 "createdAt","verifiedAt","checkedAt","updatedAt"
 FROM "GatewayPayment"
 WHERE (:'target' = '' AND ("createdAt" > now()-interval '7 days' OR status IN ('CREATED','REDIRECTED','UNKNOWN')))
    OR id=:'target' OR "intentId"=:'target' OR "trackerId"=:'target' OR ref=:'target'
 ORDER BY "createdAt" DESC LIMIT 2000
) r));
SELECT json_build_object('intents', (SELECT json_agg(r) FROM (
 SELECT i.id,i.purpose,i.status,i.amount::text,i."gatewayAmount"::text,i."refundedAmount"::text,
 i."createdAt",i."completedAt",i."updatedAt",i."expiresAt"
 FROM "PaymentIntent" i
 WHERE (:'target' = '' AND (i."createdAt" > now()-interval '7 days' OR i.status IN ('AWAITING_GATEWAY','PROCESSING')))
 OR i.id=:'target' OR EXISTS (SELECT 1 FROM "GatewayPayment" p WHERE p."intentId"=i.id AND (p.id=:'target' OR p."trackerId"=:'target' OR p.ref=:'target'))
 ORDER BY i."createdAt" DESC LIMIT 2000
) r));
SELECT json_build_object('refunds', (SELECT json_agg(r) FROM (
 SELECT id,"gatewayPaymentId",gateway,"trackerId",ref,amount::text,status,
 "createdAt","completedAt","checkedAt","updatedAt"
 FROM "GatewayRefund"
 WHERE (:'target' = '' AND ("createdAt" > now()-interval '7 days' OR status IN ('SUBMITTING','PENDING','UNKNOWN')))
 OR id=:'target' OR "gatewayPaymentId"=:'target' OR "trackerId"=:'target' OR ref=:'target'
 ORDER BY "createdAt" DESC LIMIT 2000
) r));
SELECT json_build_object('batches', (SELECT json_agg(r) FROM (
 SELECT id,"runKey",status,"tomanBatchUuid","totalAmount"::text,"itemCount","createdAt","submittedAt","completedAt","updatedAt"
 FROM "SettlementBatch"
 WHERE (:'target' = '' AND ("createdAt" > now()-interval '7 days' OR status != 'COMPLETED'))
 OR id=:'target' OR "runKey"=:'target' OR "tomanBatchUuid"=:'target'
 OR id IN (SELECT "batchId" FROM "SettlementItem" WHERE id=:'target' OR "trackerId"=:'target' OR "storeId"=:'target')
 ORDER BY "createdAt" DESC LIMIT 2000
) r));
SELECT json_build_object('items', (SELECT json_agg(r) FROM (
 SELECT id,"batchId","beneficiaryType","storeId",amount::text,"trackerId",status,
 "tomanItemUuid","tomanTransferUuid","tomanStatus","retryOfId","createdAt","submittedAt","settledAt","updatedAt"
 FROM "SettlementItem"
 WHERE (:'target' = '' AND ("createdAt" > now()-interval '7 days' OR status NOT IN ('SUCCEEDED','FAILED')))
 OR id=:'target' OR "batchId"=:'target' OR "trackerId"=:'target' OR "storeId"=:'target' OR "tomanTransferUuid"=:'target'
 ORDER BY "createdAt" DESC LIMIT 2000
) r));
COMMIT;
