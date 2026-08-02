-- CreateEnum
CREATE TYPE "PurchaseCodeStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'REFUND', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "personnelCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "defaultCap" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAllocation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "cap" BIGINT NOT NULL,
    "spent" BIGINT NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletDefinitionStore" (
    "definitionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "WalletDefinitionStore_pkey" PRIMARY KEY ("definitionId","storeId")
);

-- CreateTable
CREATE TABLE "PurchaseCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "status" "PurchaseCodeStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'PURCHASE',
    "amount" BIGINT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "storeId" TEXT,
    "purchaseCodeId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_personnelCode_key" ON "Employee"("personnelCode");

-- CreateIndex
CREATE INDEX "WalletAllocation_employeeId_idx" ON "WalletAllocation"("employeeId");

-- CreateIndex
CREATE INDEX "WalletAllocation_definitionId_idx" ON "WalletAllocation"("definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Store_username_key" ON "Store"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCode_code_key" ON "PurchaseCode"("code");

-- CreateIndex
CREATE INDEX "PurchaseCode_employeeId_status_idx" ON "PurchaseCode"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_purchaseCodeId_key" ON "Transaction"("purchaseCodeId");

-- CreateIndex
CREATE INDEX "Transaction_employeeId_createdAt_idx" ON "Transaction"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_storeId_createdAt_idx" ON "Transaction"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_allocationId_idx" ON "Transaction"("allocationId");

-- AddForeignKey
ALTER TABLE "WalletAllocation" ADD CONSTRAINT "WalletAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAllocation" ADD CONSTRAINT "WalletAllocation_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WalletDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletDefinitionStore" ADD CONSTRAINT "WalletDefinitionStore_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WalletDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletDefinitionStore" ADD CONSTRAINT "WalletDefinitionStore_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCode" ADD CONSTRAINT "PurchaseCode_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCode" ADD CONSTRAINT "PurchaseCode_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "WalletAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "WalletAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_purchaseCodeId_fkey" FOREIGN KEY ("purchaseCodeId") REFERENCES "PurchaseCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
