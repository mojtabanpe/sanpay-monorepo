CREATE TYPE "HotelProviderKey" AS ENUM ('hy', 'eg');

ALTER TYPE "BookingStatus" ADD VALUE 'HOLD';
ALTER TYPE "BookingStatus" ADD VALUE 'CANCELING';
ALTER TYPE "BookingStatus" ADD VALUE 'MODIFYING';

DROP INDEX "HotelBooking_gdsReserveId_idx";

ALTER TABLE "HotelBooking"
RENAME COLUMN "gdsReserveId" TO "providerReserveId";

ALTER TABLE "HotelBooking"
ADD COLUMN "cancellationFee" BIGINT,
ADD COLUMN "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN "provider" "HotelProviderKey";

UPDATE "HotelBooking"
SET "provider" = 'hy';

ALTER TABLE "HotelBooking"
ALTER COLUMN "provider" SET NOT NULL,
ALTER COLUMN "hotelId" TYPE TEXT USING 'hy:' || "hotelId"::TEXT,
ALTER COLUMN "roomId" TYPE TEXT USING 'hy:' || "roomId"::TEXT;

CREATE INDEX "HotelBooking_provider_providerReserveId_idx"
ON "HotelBooking"("provider", "providerReserveId");
