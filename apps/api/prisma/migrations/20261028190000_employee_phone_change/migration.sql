CREATE TABLE "EmployeePhoneChange" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "oldPhone" TEXT NOT NULL,
  "newPhone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "invalidatedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "oldNoticeSentAt" TIMESTAMP(3),
  "newNoticeSentAt" TIMESTAMP(3),
  "noticeAttempts" INTEGER NOT NULL DEFAULT 0,
  "nextNoticeAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "noticeLockedUntil" TIMESTAMP(3),
  CONSTRAINT "EmployeePhoneChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeePhoneChange_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EmployeePhoneChange_employeeId_sentAt_idx" ON "EmployeePhoneChange"("employeeId", "sentAt");
CREATE INDEX "EmployeePhoneChange_confirmedAt_nextNoticeAttemptAt_idx" ON "EmployeePhoneChange"("confirmedAt", "nextNoticeAttemptAt");
