\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '120s';
-- Explicit list, no CASCADE: a new dependent table must be reviewed first.
LOCK TABLE "WalletAllocation" IN ACCESS EXCLUSIVE MODE;
TRUNCATE TABLE
  "GdsWebhookEvent", "HotelBooking", "FlightBooking", "FlightQuote",
  "Transaction", "Payment", "GatewayReview", "GatewayRefund",
  "GatewayPayment", "PaymentIntent", "MerchantPaymentIntent", "PurchaseCode",
  "SettlementItem", "SettlementBatch";
-- Preserve assigned credit ceilings, expiry and activation. Test card money
-- must not survive the move to production as spendable personal balance.
UPDATE "WalletAllocation" a
SET spent = 0,
    cap = CASE WHEN d.kind = 'PERSONAL' THEN 0 ELSE a.cap END,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "WalletDefinition" d WHERE d.id = a."definitionId";
COMMIT;
