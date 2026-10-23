import { UpgResult } from '@sanpay/models';
import {
  PaymentIntent,
  PaymentIntentPurpose,
  Prisma,
} from '../../generated/prisma/client';

/**
 * هر بخشی که پرداخت دارد (فروشگاه، هتل، پرواز، …) یک fulfiller ثبت می‌کند.
 * بخش خرید خودش هرگز `spent` کیف پول را تغییر نمی‌دهد: intent می‌سازد، و
 * UPG بعد از جمع‌شدن کامل پول `fulfill` را صدا می‌زند.
 */
export interface UpgFulfiller {
  readonly purpose: PaymentIntentPurpose;

  /**
   * نهایی‌سازی خرید، **بعد از** اینکه کل مبلغ کسر شد. خطا = شکست خرید؛ UPG
   * همهٔ پول کسرشده را برمی‌گرداند و پیام خطای `HttpException` را به کاربر
   * نشان می‌دهد. نتیجهٔ نامعلوم (مثلاً timeout تأمین‌کننده) را با خطا اعلام
   * نکنید — پول را نگه دارید و بعداً با `UpgService.refund` برگردانید.
   */
  fulfill(intent: PaymentIntent): Promise<void>;

  /** intent قبل از کسر پول منقضی یا لغو شد — منابع نگه‌داشته‌شده را آزاد کن */
  abandon(intent: PaymentIntent): Promise<void>;

  /** آنچه بعد از پرداخت موفق نشان داده می‌شود */
  result(intent: PaymentIntent): Promise<UpgResult>;

  /** مسیر برگشت به بخش خرید وقتی کارمند انصراف می‌دهد */
  backPath(intent: PaymentIntent): string;
}

export interface CreateIntentInput {
  employeeId: string;
  purpose: PaymentIntentPurpose;
  targetId: string;
  title: string;
  subtitle?: string | null;
  /** تومان */
  amount: number;
  /** کیف‌پول‌های رفاهی مجاز — کیف پول شخصی همیشه مجاز است */
  allowedAllocationIds: string[];
  storeId?: string | null;
  merchantIntentId?: string | null;
  /** مهلت پرداخت؛ پیش‌فرض ۱۵ دقیقه */
  ttlMs?: number;
}

export type Tx = Prisma.TransactionClient;

/** خطایی که پیامش برای کارمند قابل نمایش است */
export class UpgError extends Error {}
