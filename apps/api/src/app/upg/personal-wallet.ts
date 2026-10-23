import { Prisma } from '../../generated/prisma/client';

/**
 * کیف پول شخصی (`WalletKind.PERSONAL`) به کاربر نمایش داده نمی‌شود و پول
 * خود کارمند است، نه اعتبار رفاهی. هر کوئری‌ای که کیف‌پول‌ها را برای نمایش،
 * گزارش یا تخصیص می‌خواند باید این شرط را روی `definition` بگذارد.
 */
export const WELFARE_DEFINITION = {
  kind: { not: 'PERSONAL' },
} satisfies Prisma.WalletDefinitionWhereInput;

/** کیف پول شخصی انقضا ندارد؛ ستون `expiresAt` اجباری است، پس یک تاریخ دور */
export const PERSONAL_WALLET_EXPIRY = new Date('2100-01-01T00:00:00Z');

/** نام تعریف کیف پول شخصی — همین نام روی سطر رسید خرید دیده می‌شود */
export const PERSONAL_WALLET_NAME = 'کارت بانکی';
export const PERSONAL_WALLET_ICON = 'card';

type Tx = Prisma.TransactionClient;

/**
 * کیف پول شخصی کارمند را برمی‌گرداند و اگر نبود می‌سازد. هر شرکت یک تعریف
 * PERSONAL دارد و هر کارمند یک allocation از آن. با درخواست هم‌زمان ممکن است
 * دو سطر ساخته شود؛ همیشه قدیمی‌ترین برداشته می‌شود تا مانده یک‌جا بماند.
 */
export async function ensurePersonalWallet(tx: Tx, employeeId: string) {
  const existing = await tx.walletAllocation.findFirst({
    where: { employeeId, definition: { kind: 'PERSONAL' } },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  const employee = await tx.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { companyId: true },
  });
  const definition =
    (await tx.walletDefinition.findFirst({
      where: { companyId: employee.companyId, kind: 'PERSONAL' },
      orderBy: { createdAt: 'asc' },
    })) ??
    (await tx.walletDefinition.create({
      data: {
        companyId: employee.companyId,
        kind: 'PERSONAL',
        name: PERSONAL_WALLET_NAME,
        icon: PERSONAL_WALLET_ICON,
        description:
          'پرداخت‌های کارتی کارمند در UPG — به کاربر نمایش داده نمی‌شود',
      },
    }));

  return tx.walletAllocation.create({
    data: {
      employeeId,
      definitionId: definition.id,
      cap: 0n,
      expiresAt: PERSONAL_WALLET_EXPIRY,
    },
  });
}
