-- CreateEnum
CREATE TYPE "GatewayReviewAction" AS ENUM ('PAYMENT_VERIFIED', 'PAYMENT_FAILED', 'REFUND_SUCCEEDED', 'REFUND_FAILED');

-- CreateTable
CREATE TABLE "GatewayReview" (
    "id" TEXT NOT NULL,
    "action" "GatewayReviewAction" NOT NULL,
    "gatewayPaymentId" TEXT NOT NULL,
    "gatewayRefundId" TEXT,
    "fromStatus" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GatewayReview_gatewayPaymentId_createdAt_idx" ON "GatewayReview"("gatewayPaymentId", "createdAt");

-- CreateIndex
CREATE INDEX "GatewayReview_gatewayRefundId_idx" ON "GatewayReview"("gatewayRefundId");

-- AddForeignKey
ALTER TABLE "GatewayReview" ADD CONSTRAINT "GatewayReview_gatewayPaymentId_fkey" FOREIGN KEY ("gatewayPaymentId") REFERENCES "GatewayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayReview" ADD CONSTRAINT "GatewayReview_gatewayRefundId_fkey" FOREIGN KEY ("gatewayRefundId") REFERENCES "GatewayRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayReview" ADD CONSTRAINT "GatewayReview_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
