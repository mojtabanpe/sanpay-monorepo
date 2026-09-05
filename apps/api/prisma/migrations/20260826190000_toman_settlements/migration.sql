CREATE TYPE "SettlementBatchStatus" AS ENUM ('BUILDING', 'SUBMITTED', 'PROCESSING', 'COMPLETED', 'PARTIAL_FAILED', 'FAILED');
CREATE TYPE "SettlementItemStatus" AS ENUM ('CREATED', 'SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "SettlementBeneficiaryType" AS ENUM ('STORE', 'HOTELYAR', 'EGHAMAT24');

ALTER TABLE "Store"
  ADD COLUMN "settlementIban" TEXT,
  ADD COLUMN "settlementOwnerName" TEXT;

CREATE TABLE "SettlementBatch" (
  "id" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "status" "SettlementBatchStatus" NOT NULL DEFAULT 'BUILDING',
  "tomanBatchUuid" TEXT,
  "totalAmount" BIGINT NOT NULL DEFAULT 0,
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SettlementItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "beneficiaryType" "SettlementBeneficiaryType" NOT NULL,
  "beneficiaryKey" TEXT NOT NULL,
  "storeId" TEXT,
  "beneficiaryName" TEXT NOT NULL,
  "destinationIban" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "trackerId" TEXT NOT NULL,
  "status" "SettlementItemStatus" NOT NULL DEFAULT 'CREATED',
  "tomanItemUuid" TEXT,
  "tomanTransferUuid" TEXT,
  "tomanStatus" INTEGER,
  "followUpCode" TEXT,
  "receiptLink" TEXT,
  "error" TEXT,
  "submittedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettlementItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "settlementItemId" TEXT, ADD COLUMN "settledAt" TIMESTAMP(3);
ALTER TABLE "HotelBooking" ADD COLUMN "settlementItemId" TEXT;

CREATE UNIQUE INDEX "SettlementBatch_runKey_key" ON "SettlementBatch"("runKey");
CREATE UNIQUE INDEX "SettlementBatch_tomanBatchUuid_key" ON "SettlementBatch"("tomanBatchUuid");
CREATE INDEX "SettlementBatch_status_createdAt_idx" ON "SettlementBatch"("status", "createdAt");
CREATE UNIQUE INDEX "SettlementItem_trackerId_key" ON "SettlementItem"("trackerId");
CREATE UNIQUE INDEX "SettlementItem_tomanItemUuid_key" ON "SettlementItem"("tomanItemUuid");
CREATE UNIQUE INDEX "SettlementItem_batchId_beneficiaryType_beneficiaryKey_key" ON "SettlementItem"("batchId", "beneficiaryType", "beneficiaryKey");
CREATE INDEX "SettlementItem_batchId_status_idx" ON "SettlementItem"("batchId", "status");
CREATE INDEX "Payment_settlementItemId_idx" ON "Payment"("settlementItemId");
CREATE INDEX "HotelBooking_settlementItemId_idx" ON "HotelBooking"("settlementItemId");

ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementItem" ADD CONSTRAINT "SettlementItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_settlementItemId_fkey" FOREIGN KEY ("settlementItemId") REFERENCES "SettlementItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_settlementItemId_fkey" FOREIGN KEY ("settlementItemId") REFERENCES "SettlementItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
