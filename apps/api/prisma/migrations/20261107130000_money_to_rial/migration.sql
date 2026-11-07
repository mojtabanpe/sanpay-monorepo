-- واحد پول کل سامانه از تومان به ریال تغییر می‌کند (آبان ۱۴۰۵).
-- هر ستون مبلغ ×۱۰ می‌شود، همراه مبالغ داخل JSONهایی که سامانه خودش می‌نویسد
-- (تقسیم UPG و پیشنهاد پرواز). `raw` درگاه‌ها و payload وب‌هوک از قبل ریال‌اند و دست نمی‌خورند.
-- `tomanStatus` و شمارنده‌ها مبلغ نیستند.

UPDATE "WalletDefinition" SET "defaultCap" = "defaultCap" * 10 WHERE "defaultCap" IS NOT NULL;
UPDATE "WalletAllocation" SET "cap" = "cap" * 10, "spent" = "spent" * 10;

UPDATE "Payment" SET "amount" = "amount" * 10;
UPDATE "MerchantPaymentIntent" SET "amount" = "amount" * 10;
UPDATE "Transaction" SET "amount" = "amount" * 10;

UPDATE "HotelBooking" SET
  "amount" = "amount" * 10,
  "payable" = "payable" * 10,
  "refundedAmount" = "refundedAmount" * 10,
  "cancellationFee" = "cancellationFee" * 10;

UPDATE "SettlementBatch" SET "totalAmount" = "totalAmount" * 10;
UPDATE "SettlementItem" SET "amount" = "amount" * 10;

UPDATE "FlightQuote" SET "amount" = "amount" * 10;
UPDATE "FlightQuote"
SET "offer" = jsonb_set("offer", '{amount}', to_jsonb((("offer"->>'amount')::numeric * 10)::bigint))
WHERE jsonb_typeof("offer"->'amount') = 'number';
UPDATE "FlightBooking" SET "amount" = "amount" * 10;

UPDATE "PaymentIntent" SET
  "amount" = "amount" * 10,
  "gatewayAmount" = "gatewayAmount" * 10,
  "refundedAmount" = "refundedAmount" * 10;
UPDATE "PaymentIntent" SET "plan" = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(line) = 'object' AND line ? 'amount'
      THEN jsonb_set(line, '{amount}', to_jsonb(((line->>'amount')::numeric * 10)::bigint))
      ELSE line END
    ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements("plan") WITH ORDINALITY AS t(line, ord)
)
WHERE "plan" IS NOT NULL AND jsonb_typeof("plan") = 'array';

UPDATE "GatewayPayment" SET "amount" = "amount" * 10, "refundedAmount" = "refundedAmount" * 10;
UPDATE "GatewayRefund" SET "amount" = "amount" * 10;
