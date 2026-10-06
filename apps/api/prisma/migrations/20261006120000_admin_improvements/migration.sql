ALTER TABLE "Employee" ADD COLUMN "birthDate" DATE, ADD COLUMN "deletedAt" TIMESTAMP(3);
DROP INDEX "Employee_phone_key";
CREATE INDEX "Employee_phone_idx" ON "Employee"("phone");
ALTER TABLE "Store" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "WalletDefinition" ADD COLUMN "imageUrl" TEXT;
