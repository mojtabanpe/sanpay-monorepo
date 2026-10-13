-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "nationalCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "mobile" TEXT,
    "birthdate" TEXT,
    "gender" TEXT,
    "nationality" TEXT,
    "passportNumber" TEXT,
    "passportExpirationDate" TEXT,
    "passportIssueCountry" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Traveler_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Traveler_employeeId_lastUsedAt_idx" ON "Traveler"("employeeId", "lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Traveler_employeeId_nationalCode_key" ON "Traveler"("employeeId", "nationalCode");

-- AddForeignKey
ALTER TABLE "Traveler" ADD CONSTRAINT "Traveler_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: the newest snapshot of each passenger from confirmed flight bookings
-- (the same rows the old merged read used) ...
INSERT INTO "Traveler" (
    "id", "employeeId", "nationalCode", "firstName", "lastName", "mobile",
    "birthdate", "gender", "nationality", "passportNumber",
    "passportExpirationDate", "passportIssueCountry", "lastUsedAt", "createdAt"
)
SELECT DISTINCT ON (fb."employeeId", p->>'nationalCode')
    gen_random_uuid()::text, fb."employeeId", p->>'nationalCode',
    p->>'firstName', p->>'lastName', fb."bookerMobile",
    p->>'birthdate',
    CASE WHEN p->>'gender' IN ('male', 'female') THEN p->>'gender' END,
    p->>'nationality', p->>'passportNumber',
    p->>'passportExpirationDate', p->>'passportIssueCountry',
    fb."createdAt", fb."createdAt"
FROM "FlightBooking" fb
CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(fb."passengers") = 'array' THEN fb."passengers" ELSE '[]'::jsonb END
) AS p
WHERE fb."status" = 'CONFIRMED'
  AND fb."bookerMobile" IS NOT NULL
  AND jsonb_typeof(p) = 'object'
  AND coalesce(p->>'nationalCode', '') <> ''
  AND p->>'firstName' IS NOT NULL
  AND p->>'lastName' IS NOT NULL
ORDER BY fb."employeeId", p->>'nationalCode', fb."createdAt" DESC;

-- ... then hotel guests, which only overwrite name/mobile when they are newer
-- and never clear the flight-only fields (birthdate, passport, ...).
INSERT INTO "Traveler" (
    "id", "employeeId", "nationalCode", "firstName", "lastName", "mobile",
    "lastUsedAt", "createdAt"
)
SELECT DISTINCT ON (hb."employeeId", hb."guestIdNo")
    gen_random_uuid()::text, hb."employeeId", hb."guestIdNo",
    hb."guestFirstName", hb."guestLastName", hb."guestMobile",
    hb."createdAt", hb."createdAt"
FROM "HotelBooking" hb
WHERE hb."guestFirstName" IS NOT NULL
  AND hb."guestLastName" IS NOT NULL
  AND hb."guestMobile" IS NOT NULL
  AND hb."guestIdNo" <> ''
ORDER BY hb."employeeId", hb."guestIdNo", hb."createdAt" DESC
ON CONFLICT ("employeeId", "nationalCode") DO UPDATE SET
    "firstName" = EXCLUDED."firstName",
    "lastName" = EXCLUDED."lastName",
    "mobile" = EXCLUDED."mobile",
    "lastUsedAt" = EXCLUDED."lastUsedAt"
WHERE "Traveler"."lastUsedAt" < EXCLUDED."lastUsedAt";
