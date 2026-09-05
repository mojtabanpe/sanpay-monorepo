ALTER TABLE "Employee" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TABLE "EmployeeOtp" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeOtp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeOtp_employeeId_key" ON "EmployeeOtp"("employeeId");
CREATE INDEX "EmployeeOtp_expiresAt_idx" ON "EmployeeOtp"("expiresAt");

ALTER TABLE "EmployeeOtp"
ADD CONSTRAINT "EmployeeOtp_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
