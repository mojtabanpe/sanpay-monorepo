-- AlterTable
ALTER TABLE "WalletDefinition" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT,
ADD COLUMN "deletedNote" TEXT;
