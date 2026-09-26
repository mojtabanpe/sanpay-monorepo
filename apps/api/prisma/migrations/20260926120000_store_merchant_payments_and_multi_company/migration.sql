-- Store presentation and navigation data.
ALTER TABLE "Store"
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6);

-- The same person may have separate employment records in different companies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Employee"
    WHERE "phone" IS NOT NULL
    GROUP BY "phone"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate employee phones must be resolved before this migration';
  END IF;
END $$;

DROP INDEX IF EXISTS "Employee_nationalCode_key";
DROP INDEX IF EXISTS "Employee_personnelCode_key";
CREATE UNIQUE INDEX "Employee_companyId_nationalCode_key"
  ON "Employee"("companyId", "nationalCode");
CREATE UNIQUE INDEX "Employee_companyId_personnelCode_key"
  ON "Employee"("companyId", "personnelCode");
CREATE UNIQUE INDEX "Employee_phone_key" ON "Employee"("phone");
CREATE INDEX "Employee_nationalCode_idx" ON "Employee"("nationalCode");

CREATE TYPE "MerchantPaymentIntentStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'CANCELED');

CREATE TABLE "MerchantPaymentIntent" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "status" "MerchantPaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchantPaymentIntent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "merchantIntentId" TEXT;
ALTER TABLE "SettlementItem" ADD COLUMN "retryOfId" TEXT;

CREATE UNIQUE INDEX "MerchantPaymentIntent_idempotencyKey_key"
  ON "MerchantPaymentIntent"("idempotencyKey");
CREATE INDEX "MerchantPaymentIntent_storeId_createdAt_idx"
  ON "MerchantPaymentIntent"("storeId", "createdAt");
CREATE INDEX "MerchantPaymentIntent_employeeId_status_expiresAt_idx"
  ON "MerchantPaymentIntent"("employeeId", "status", "expiresAt");
CREATE UNIQUE INDEX "Payment_merchantIntentId_key" ON "Payment"("merchantIntentId");
CREATE INDEX "SettlementItem_retryOfId_idx" ON "SettlementItem"("retryOfId");

ALTER TABLE "MerchantPaymentIntent"
  ADD CONSTRAINT "MerchantPaymentIntent_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MerchantPaymentIntent"
  ADD CONSTRAINT "MerchantPaymentIntent_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_merchantIntentId_fkey"
  FOREIGN KEY ("merchantIntentId") REFERENCES "MerchantPaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem"
  ADD CONSTRAINT "SettlementItem_retryOfId_fkey"
  FOREIGN KEY ("retryOfId") REFERENCES "SettlementItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
