-- CreateEnum
CREATE TYPE "OrganizationalRank" AS ENUM ('MANAGER', 'DEPUTY', 'HEAD', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Preserve existing records by assigning them to a default company.
INSERT INTO "Company" ("id", "name", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'شرکت پیش‌فرض', CURRENT_TIMESTAMP);

-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
ADD COLUMN "organizationalRank" "OrganizationalRank" NOT NULL DEFAULT 'EMPLOYEE';

ALTER TABLE "WalletDefinition"
ADD COLUMN "companyId" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';

-- New records must always provide their company and rank explicitly.
ALTER TABLE "Employee" ALTER COLUMN "companyId" DROP DEFAULT;
ALTER TABLE "Employee" ALTER COLUMN "organizationalRank" DROP DEFAULT;
ALTER TABLE "WalletDefinition" ALTER COLUMN "companyId" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");
CREATE INDEX "WalletDefinition_companyId_idx" ON "WalletDefinition"("companyId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletDefinition" ADD CONSTRAINT "WalletDefinition_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce company consistency even for direct database writes and future import paths.
CREATE FUNCTION "assert_wallet_allocation_company"() RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT "companyId" FROM "Employee" WHERE "id" = NEW."employeeId")
     IS DISTINCT FROM
     (SELECT "companyId" FROM "WalletDefinition" WHERE "id" = NEW."definitionId") THEN
    RAISE EXCEPTION 'کارمند و کیف پول باید مربوط به یک شرکت باشند';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletAllocation_company_check"
BEFORE INSERT OR UPDATE OF "employeeId", "definitionId" ON "WalletAllocation"
FOR EACH ROW EXECUTE FUNCTION "assert_wallet_allocation_company"();

CREATE FUNCTION "assert_employee_company_change"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId" AND EXISTS (
    SELECT 1 FROM "WalletAllocation" allocation
    JOIN "WalletDefinition" definition ON definition."id" = allocation."definitionId"
    WHERE allocation."employeeId" = NEW."id" AND definition."companyId" <> NEW."companyId"
  ) THEN
    RAISE EXCEPTION 'کارمند هنوز کیف پول شرکت قبلی را دارد';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Employee_company_change_check"
BEFORE UPDATE OF "companyId" ON "Employee"
FOR EACH ROW EXECUTE FUNCTION "assert_employee_company_change"();

CREATE FUNCTION "assert_wallet_definition_company_change"() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."companyId" IS DISTINCT FROM OLD."companyId" AND EXISTS (
    SELECT 1 FROM "WalletAllocation" allocation
    JOIN "Employee" employee ON employee."id" = allocation."employeeId"
    WHERE allocation."definitionId" = NEW."id" AND employee."companyId" <> NEW."companyId"
  ) THEN
    RAISE EXCEPTION 'کیف پول هنوز به کارمندان شرکت قبلی تخصیص دارد';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletDefinition_company_change_check"
BEFORE UPDATE OF "companyId" ON "WalletDefinition"
FOR EACH ROW EXECUTE FUNCTION "assert_wallet_definition_company_change"();
