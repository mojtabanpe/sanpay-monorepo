-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "storeConfirmedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Payment_storeId_storeConfirmedAt_createdAt_idx" ON "Payment"("storeId", "storeConfirmedAt", "createdAt");
