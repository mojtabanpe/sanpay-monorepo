-- English names get their own columns, so a flight booking never overwrites
-- the Persian name a hotel booking saved (and the flight form never reads it).
ALTER TABLE "Traveler" ADD COLUMN "firstNameEn" TEXT;
ALTER TABLE "Traveler" ADD COLUMN "lastNameEn" TEXT;
ALTER TABLE "Traveler" ALTER COLUMN "firstName" DROP NOT NULL;
ALTER TABLE "Traveler" ALTER COLUMN "lastName" DROP NOT NULL;

-- A Latin name in the Persian columns was written there by a flight booking
-- (the old single name pair). Move it to the English columns and leave the
-- Persian name empty, so the hotel form never offers an English name.
UPDATE "Traveler"
SET "firstNameEn" = "firstName",
    "lastNameEn" = "lastName",
    "firstName" = NULL,
    "lastName" = NULL
WHERE "firstName" ~ '^[A-Za-z][A-Za-z '' -]*$'
  AND "lastName" ~ '^[A-Za-z][A-Za-z '' -]*$';
