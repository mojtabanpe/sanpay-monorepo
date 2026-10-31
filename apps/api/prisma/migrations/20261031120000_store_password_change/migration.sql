-- AlterTable
ALTER TABLE "Store" ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN "sessionsValidAfter" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StorePasswordOtp" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorePasswordOtp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StorePasswordOtp_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StorePasswordOtp_storeId_key" ON "StorePasswordOtp"("storeId");
