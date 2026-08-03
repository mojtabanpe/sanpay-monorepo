/**
 * قالب‌بندی مشترک داشبورد: اعداد فارسی، مبلغ تومان و تاریخ جلالی.
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

/** «۲۴٬۵۰۰٬۰۰۰ تومان» */
export function toman(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${amountFormatter.format(value)} تومان`;
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

/** ورودی مبلغ کاربر (با رقم فارسی/عربی یا جداکنندهٔ هزار) → عدد */
export function parseAmount(raw: string): number {
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\d-]/g, '');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

export const WALLET_KIND_LABELS: Record<string, string> = {
  CREDIT: 'اعتبار خرید',
  RATION: 'ارزاق',
  TOURISM: 'گردشگری',
};

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: 'قطعی',
  PENDING: 'در انتظار تأیید',
  REJECTED: 'رد شده',
  CANCELED: 'کنسل شده',
};

export const ADMIN_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدیر ارشد',
  ADMIN: 'مدیر',
  VIEWER: 'فقط مشاهده',
};
