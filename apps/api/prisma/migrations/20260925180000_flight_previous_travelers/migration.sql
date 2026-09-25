ALTER TABLE "FlightBooking"
ADD COLUMN "passengers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "bookerMobile" TEXT;
