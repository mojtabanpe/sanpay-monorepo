import { Prisma } from '../../generated/prisma/client';

/**
 * کارمند حذف‌شده فقط بایگانی است (`deletedAt`)، ولی ستون‌های یکتایش — موبایل
 * (یکتای کل سامانه) و کد پرسنلی (یکتای شرکت) — هنوز جا را گرفته بودند. واحد
 * رفاه همهٔ کارمندان را حذف کرد تا فایل اصلاح‌شده را دوباره وارد کند و هر سطر با
 * «شماره موبایل قبلاً برای استخدام دیگری ثبت شده است» رد شد.
 *
 * این تابع، در همان تراکنشِ ساخت/بازگردانی، آن مقادیر را از ردیف‌های حذف‌شده
 * پس می‌گیرد: موبایل `null` و کد پرسنلی به `deleted:<id>` (یکتا و غیرقابل
 * ورود). تاریخچهٔ پرداخت و تراکنش‌ها به `id` بسته است و دست نمی‌خورد.
 */
export async function releaseDeletedEmployeeSlots(
  tx: Prisma.TransactionClient,
  companyId: string,
  phones: string[],
  personnelCodes: string[],
): Promise<void> {
  if (phones.length) {
    await tx.employee.updateMany({
      where: { deletedAt: { not: null }, phone: { in: phones } },
      data: { phone: null },
    });
  }
  if (!personnelCodes.length) return;
  const holders = await tx.employee.findMany({
    where: {
      deletedAt: { not: null },
      companyId,
      personnelCode: { in: personnelCodes },
    },
    select: { id: true },
  });
  for (const holder of holders) {
    await tx.employee.update({
      where: { id: holder.id },
      data: { personnelCode: `deleted:${holder.id}` },
    });
  }
}

/**
 * کارمند حذف‌شده‌ای که با همان کد ملی در همان شرکت دوباره ثبت می‌شود، همان
 * ردیف قبلی است که برمی‌گردد — نه یک ردیف تازه — تا تاریخچه‌اش کنار بماند و
 * یکتایی (شرکت، کد ملی) نشکند. کیف‌پول‌هایش غیرفعال می‌مانند تا دوباره تخصیص
 * داده شوند، و نشست‌های قدیمی‌اش باطل می‌شوند.
 */
export async function restoreDeletedEmployee(
  tx: Prisma.TransactionClient,
  id: string,
  data: {
    personnelCode: string;
    birthDate: Date | null;
    firstName: string;
    lastName: string;
    phone: string;
    organizationalRank: Prisma.EmployeeUpdateInput['organizationalRank'];
  },
) {
  await tx.employeeSession.updateMany({
    where: { employeeId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return tx.employee.update({
    where: { id },
    data: { ...data, deletedAt: null, isActive: true },
    include: { company: true },
  });
}
