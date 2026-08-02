-- CreateEnum
CREATE TYPE "WalletKind" AS ENUM ('CREDIT', 'RATION');

-- AlterTable
ALTER TABLE "WalletDefinition" ADD COLUMN     "kind" "WalletKind" NOT NULL DEFAULT 'CREDIT';
