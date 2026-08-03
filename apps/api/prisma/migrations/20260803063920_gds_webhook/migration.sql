-- AlterTable
ALTER TABLE "HotelBooking" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "refundedAmount" BIGINT,
ADD COLUMN     "statusNote" TEXT;

-- CreateTable
CREATE TABLE "GdsWebhookEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "changeId" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "bookingId" TEXT,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GdsWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GdsWebhookEvent_receivedAt_idx" ON "GdsWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GdsWebhookEvent_action_reservationId_changeId_key" ON "GdsWebhookEvent"("action", "reservationId", "changeId");

-- CreateIndex
CREATE INDEX "HotelBooking_gdsReserveId_idx" ON "HotelBooking"("gdsReserveId");

-- AddForeignKey
ALTER TABLE "GdsWebhookEvent" ADD CONSTRAINT "GdsWebhookEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "HotelBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
