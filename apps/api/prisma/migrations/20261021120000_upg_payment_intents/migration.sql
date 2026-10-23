-- CreateEnum
CREATE TYPE "PaymentIntentPurpose" AS ENUM ('STORE', 'HOTEL', 'FLIGHT');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'AWAITING_GATEWAY', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GatewayPaymentStatus" AS ENUM ('CREATED', 'REDIRECTED', 'VERIFIED', 'FAILED', 'EXPIRED', 'UNKNOWN');

-- AlterEnum
ALTER TYPE "WalletKind" ADD VALUE 'PERSONAL';

-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'TOPUP';
ALTER TYPE "TransactionType" ADD VALUE 'WITHDRAWAL';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "intentId" TEXT;

-- AlterTable
ALTER TABLE "HotelBooking" ADD COLUMN     "intentId" TEXT,
ALTER COLUMN "allocationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "gatewayPaymentId" TEXT,
ADD COLUMN     "intentId" TEXT;

-- AlterTable
ALTER TABLE "FlightBooking" ADD COLUMN     "bookerFirstName" TEXT,
ADD COLUMN     "bookerLastName" TEXT,
ADD COLUMN     "intentId" TEXT,
ALTER COLUMN "allocationId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "purpose" "PaymentIntentPurpose" NOT NULL,
    "targetId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "amount" BIGINT NOT NULL,
    "allowedAllocationIds" TEXT[],
    "storeId" TEXT,
    "plan" JSONB,
    "gatewayAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "refundedAmount" BIGINT NOT NULL DEFAULT 0,
    "merchantIntentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayPayment" (
    "id" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "trackerId" TEXT NOT NULL,
    "ref" TEXT,
    "amount" BIGINT NOT NULL,
    "status" "GatewayPaymentStatus" NOT NULL DEFAULT 'CREATED',
    "psp" TEXT,
    "terminal" TEXT,
    "traceNumber" TEXT,
    "referenceNumber" TEXT,
    "maskedCard" TEXT,
    "raw" JSONB,
    "error" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "refundedAmount" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_merchantIntentId_key" ON "PaymentIntent"("merchantIntentId");

-- CreateIndex
CREATE INDEX "PaymentIntent_employeeId_createdAt_idx" ON "PaymentIntent"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_expiresAt_idx" ON "PaymentIntent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_purpose_targetId_idx" ON "PaymentIntent"("purpose", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayPayment_trackerId_key" ON "GatewayPayment"("trackerId");

-- CreateIndex
CREATE INDEX "GatewayPayment_intentId_idx" ON "GatewayPayment"("intentId");

-- CreateIndex
CREATE INDEX "GatewayPayment_status_createdAt_idx" ON "GatewayPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GatewayPayment_employeeId_createdAt_idx" ON "GatewayPayment"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GatewayPayment_gateway_ref_key" ON "GatewayPayment"("gateway", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_intentId_key" ON "Payment"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelBooking_intentId_key" ON "HotelBooking"("intentId");

-- CreateIndex
CREATE INDEX "Transaction_intentId_idx" ON "Transaction"("intentId");

-- CreateIndex
CREATE INDEX "Transaction_gatewayPaymentId_idx" ON "Transaction"("gatewayPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FlightBooking_intentId_key" ON "FlightBooking"("intentId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_gatewayPaymentId_fkey" FOREIGN KEY ("gatewayPaymentId") REFERENCES "GatewayPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightBooking" ADD CONSTRAINT "FlightBooking_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_merchantIntentId_fkey" FOREIGN KEY ("merchantIntentId") REFERENCES "MerchantPaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayPayment" ADD CONSTRAINT "GatewayPayment_intentId_fkey" FOREIGN KEY ("intentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GatewayPayment" ADD CONSTRAINT "GatewayPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

