CREATE TABLE "FlightQuote" (
  "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "search" JSONB NOT NULL,
  "offer" JSONB NOT NULL, "amount" BIGINT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlightQuote_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "FlightBooking" (
  "id" TEXT NOT NULL, "quoteId" TEXT NOT NULL, "employeeId" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL, "confirmationCode" TEXT, "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "amount" BIGINT NOT NULL, "refunded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FlightBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FlightBooking_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "FlightQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FlightBooking_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FlightBooking_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "WalletAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FlightBooking_quoteId_key" ON "FlightBooking"("quoteId");
CREATE UNIQUE INDEX "FlightBooking_confirmationCode_key" ON "FlightBooking"("confirmationCode");
CREATE INDEX "FlightQuote_employeeId_expiresAt_idx" ON "FlightQuote"("employeeId", "expiresAt");
CREATE INDEX "FlightBooking_employeeId_createdAt_idx" ON "FlightBooking"("employeeId", "createdAt");
CREATE INDEX "FlightBooking_status_updatedAt_idx" ON "FlightBooking"("status", "updatedAt");
