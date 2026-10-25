import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';

/** مبلغ ورودی به اعتبار موجود اضافه می‌شود؛ ثبت شارژ و تغییر مانده اتمیک است. */
export async function creditAllocation(
  tx: Prisma.TransactionClient,
  employeeId: string,
  definitionId: string,
  amount: bigint,
  expiresAt: Date,
) {
  if (amount <= 0n)
    throw new BadRequestException('مبلغ شارژ باید بیشتر از صفر باشد');
  // شارژهای هم‌زمان یک کارمند نباید تخصیص تکراری بسازند.
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${employeeId}), hashtext(${definitionId}))`;
  const existing = await tx.walletAllocation.findFirst({
    where: { employeeId, definitionId, isActive: true },
  });
  const allocation = existing
    ? await tx.walletAllocation.update({
        where: { id: existing.id },
        data: { cap: { increment: amount }, expiresAt },
        include: { definition: true },
      })
    : await tx.walletAllocation.create({
        data: { employeeId, definitionId, cap: amount, expiresAt },
        include: { definition: true },
      });
  await tx.transaction.create({
    data: {
      type: 'TOPUP',
      amount,
      employeeId,
      allocationId: allocation.id,
      note: 'شارژ کیف پول از داشبورد',
    },
  });
  return { allocation, created: !existing };
}
