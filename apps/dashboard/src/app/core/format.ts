/**
 * قالب‌بندی مشترک داشبورد: اعداد فارسی، نمایش ریال و تاریخ جلالی.
 * `Intl` با locale `fa-IR-u-ca-persian` هم رقم فارسی می‌دهد و هم تقویم جلالی،
 * پس اینجا به کتابخانهٔ تاریخ نیازی نیست.
 */

const amountFormatter = new Intl.NumberFormat('fa-IR');
const dateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateTimeFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** تومان ذخیره‌شده → ریال نمایشی */
export function toman(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${amountFormatter.format(value * 10)} ریال`;
}

/** فقط عدد فارسی، بدون واحد */
export function fa(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return amountFormatter.format(value);
}

/** «۱۴۰۵/۰۶/۳۱» */
export function jalali(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateFormatter.format(new Date(iso));
}

/** «۱۴۰۵/۰۶/۳۱، ۱۴:۰۵» */
export function jalaliTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dateTimeFormatter.format(new Date(iso));
}

/** ISO تاریخ (YYYY-MM-DD) از یک Date — همان چیزی که API انتظار دارد */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** ورودی ریالی کاربر (با رقم فارسی/عربی یا جداکنندهٔ هزار) → تومان برای API */
export function parseAmount(raw: string): number {
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\d-]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value / 10 : 0;
}

export const WALLET_KIND_LABELS: Record<string, string> = {
  CREDIT: 'اعتبار خرید',
  RATION: 'ارزاق',
  TOURISM: 'گردشگری',
};

export const ORGANIZATIONAL_RANK_LABELS: Record<string, string> = {
  MANAGER: 'مدیر',
  DEPUTY: 'معاون',
  HEAD: 'رییس',
  EMPLOYEE: 'کارمند',
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'قطعی',
  PENDING: 'در انتظار تأیید',
  REJECTED: 'رد شده',
  CANCELED: 'کنسل شده',
};

export const FLIGHT_BOOKING_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'قطعی',
  PROCESSING: 'در حال صدور',
  REVIEW: 'نیازمند بررسی',
  REJECTED: 'ناموفق',
};

export const ADMIN_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدیر ارشد',
  ADMIN: 'مدیر',
  VIEWER: 'فقط مشاهده',
};

// ─── UPG ────────────────────────────────────────────────────────────────

export const GATEWAY_PAYMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: 'ساخته‌شده',
  REDIRECTED: 'در صفحهٔ بانک',
  VERIFIED: 'تأییدشده',
  FAILED: 'ناموفق',
  EXPIRED: 'منقضی',
  UNKNOWN: 'نامعلوم',
};

export const GATEWAY_REFUND_STATUS_LABELS: Record<string, string> = {
  SUBMITTING: 'در حال ثبت',
  PENDING: 'در جریان',
  UNKNOWN: 'نامعلوم',
  SUCCEEDED: 'به کارت رسید',
  FAILED: 'ناموفق',
  DENIED: 'رد شد',
};

export const INTENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'منتظر پرداخت',
  AWAITING_GATEWAY: 'منتظر درگاه',
  PROCESSING: 'در حال نهایی‌سازی',
  COMPLETED: 'انجام شد',
  FAILED: 'ناموفق — برگشت داده شد',
  EXPIRED: 'منقضی',
  CANCELED: 'لغو شد',
};

export const INTENT_PURPOSE_LABELS: Record<string, string> = {
  STORE: 'خرید فروشگاهی',
  HOTEL: 'رزرو هتل',
  FLIGHT: 'بلیت پرواز',
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'کسر برای خرید',
  REFUND: 'برگشت',
  ADJUSTMENT: 'اصلاح دستی',
  TOPUP: 'واریز',
  WITHDRAWAL: 'برداشت',
};

export const GATEWAY_REVIEW_ACTION_LABELS: Record<string, string> = {
  PAYMENT_VERIFIED: 'پرداخت تأیید شد',
  PAYMENT_FAILED: 'پرداخت ناموفق اعلام شد',
  REFUND_SUCCEEDED: 'بازگشت موفق اعلام شد',
  REFUND_FAILED: 'بازگشت ناموفق اعلام شد',
};

/** رنگ نشان وضعیت پرداخت/بازگشت درگاه — قرمز فقط برای آنچه کار دارد یا شکست خورده */
export function gatewayStatusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'VERIFIED':
    case 'SUCCEEDED':
      return 'default';
    case 'UNKNOWN':
    case 'FAILED':
    case 'DENIED':
      return 'destructive';
    case 'EXPIRED':
      return 'outline';
    default:
      return 'secondary';
  }
}
