-- CreateEnum
CREATE TYPE "GatewayRefundStatus" AS ENUM ('SUBMITTING', 'PENDING', 'UNKNOWN', 'SUCCEEDED', 'FAILED', 'DENIED');

-- AlterTable
ALTER TABLE "GatewayPayment" ADD COLUMN     "checkedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "gatewayRefundId" TEXT;

-- CreateTable
CREATE TABLE "GatewayRefund" (
    "id" TEXT NOT NULL,
    "gatewayPaymentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "ref" TEXT,
    "status" "GatewayRefundStatus" NOT NULL DEFAULT 'SUBMITTING',
    "error" TEXT,
    "raw" JSONB,
    "checkedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayRefund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GatewayRefund_trackerId_key" ON "GatewayRefund"("trackerId");

-- CreateIndex
CREATE INDEX "GatewayRefund_gatewayPaymentId_idx" ON "GatewayRefund"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "GatewayRefund_employeeId_createdAt_idx" ON "GatewayRefund"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "GatewayRefund_status_checkedAt_idx" ON "GatewayRefund"("status", "checkedAt");

-- CreateIndex
CREATE INDEX "Transaction_gatewayRefundId_idx" ON "Transaction"("gatewayRefundId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_gatewayRefundId_fkey" FOREIGN KEY ("gatewayRefundId") REFERENCES "GatewayRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayRefund" ADD CONSTRAINT "GatewayRefund_gatewayPaymentId_fkey" FOREIGN KEY ("gatewayPaymentId") REFERENCES "GatewayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayRefund" ADD CONSTRAINT "GatewayRefund_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

