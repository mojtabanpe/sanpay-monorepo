-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'PENDING', 'REJECTED', 'CANCELED');

-- AlterEnum
ALTER TYPE "WalletKind" ADD VALUE 'TOURISM';

-- CreateTable
CREATE TABLE "HotelBooking" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "gdsReserveId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "employeeId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "transactionId" TEXT,
    "hotelId" INTEGER NOT NULL,
    "hotelName" TEXT NOT NULL,
    "roomId" INTEGER NOT NULL,
    "roomType" TEXT NOT NULL,
    "checkin" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestIdNo" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "payable" BIGINT NOT NULL,
    "settledAt" TIMESTAMP(3),
    "settlementBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelBooking_referenceNo_key" ON "HotelBooking"("referenceNo");

-- CreateIndex
CREATE UNIQUE INDEX "HotelBooking_transactionId_key" ON "HotelBooking"("transactionId");

-- CreateIndex
CREATE INDEX "HotelBooking_employeeId_createdAt_idx" ON "HotelBooking"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "HotelBooking_settledAt_idx" ON "HotelBooking"("settledAt");

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "WalletAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBooking" ADD CONSTRAINT "HotelBooking_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
