-- AlterTable: کد کوتاه فروشگاه (محتوای QR ثابت صندوق)
-- ابتدا nullable اضافه می‌شود، از username پر می‌شود، بعد NOT NULL می‌گردد.
ALTER TABLE "Store" ADD COLUMN "code" TEXT;
UPDATE "Store" SET "code" = UPPER("username") WHERE "code" IS NULL;
ALTER TABLE "Store" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE INDEX "Payment_storeId_createdAt_idx" ON "Payment"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_employeeId_createdAt_idx" ON "Payment"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Store_code_key" ON "Store"("code");

-- CreateIndex
CREATE INDEX "Transaction_paymentId_idx" ON "Transaction"("paymentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
