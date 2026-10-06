-- Every employment has an independent account and mobile number.
-- Fail safely rather than modifying existing employee identities.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Employee" WHERE "phone" IS NOT NULL GROUP BY "phone" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate employee phones must be resolved before restoring unique accounts';
  END IF;
END $$;
DROP INDEX IF EXISTS "Employee_phone_idx";
CREATE UNIQUE INDEX "Employee_phone_key" ON "Employee"("phone");
