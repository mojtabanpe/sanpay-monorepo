-- کارمندان حذف‌شده موبایل یکتا را نگه می‌داشتند و ورود مجدد همان افراد از فایل
-- با «شماره موبایل قبلاً ثبت شده» رد می‌شد. حذف از این پس موبایل را آزاد می‌کند؛
-- این مهاجرت همان کار را برای ردیف‌های حذف‌شدهٔ قبلی انجام می‌دهد و نشست‌هایشان را می‌بندد.
UPDATE "Employee" SET "phone" = NULL WHERE "deletedAt" IS NOT NULL AND "phone" IS NOT NULL;

UPDATE "EmployeeSession" SET "revokedAt" = NOW()
WHERE "revokedAt" IS NULL
  AND "employeeId" IN (SELECT "id" FROM "Employee" WHERE "deletedAt" IS NOT NULL);
