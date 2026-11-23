-- English names get their own columns, so a flight booking never overwrites
-- the Persian name a hotel booking saved (and the flight form never reads it).
ALTER TABLE "Traveler" ADD COLUMN "firstNameEn" TEXT;
ALTER TABLE "Traveler" ADD COLUMN "lastNameEn" TEXT;

-- Rows whose name is already Latin came from a flight booking: keep it as
-- the English name. Persian names stay where they are.
UPDATE "Traveler"
SET "firstNameEn" = "firstName", "lastNameEn" = "lastName"
WHERE "firstName" ~ '^[A-Za-z][A-Za-z '' -]*$'
  AND "lastName" ~ '^[A-Za-z][A-Za-z '' -]*$';
