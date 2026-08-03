/** قالب‌بندی فارسی مشترک بین صفحه‌های گردشگری */

const NUMBER = new Intl.NumberFormat('fa-IR');
const JALALI = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const JALALI_LONG = new Intl.DateTimeFormat('fa-IR', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function faNumber(value: number): string {
  return NUMBER.format(value);
}

export function toman(value: number): string {
  return `${NUMBER.format(value)} تومان`;
}

/** «۱۴۰۵/۰۶/۳۱» از تاریخ ISO یا YYYY-MM-DD */
export function jalali(isoDate: string): string {
  return JALALI.format(parseDate(isoDate));
}

/** «شنبه ۳۱ شهریور» — برای هدر تاریخ */
export function jalaliLong(isoDate: string): string {
  return JALALI_LONG.format(parseDate(isoDate));
}

/** YYYY-MM-DD امروز، در ناحیهٔ زمانی محلی */
export function today(): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const date = parseDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * تاریخ‌های YYYY-MM-DD به‌عنوان UTC خوانده می‌شوند تا در ناحیه‌های زمانی شرقی
 * (مثل تهران) یک روز عقب نیفتند.
 */
function parseDate(isoDate: string): Date {
  return new Date(
    isoDate.length === 10 ? `${isoDate}T00:00:00Z` : isoDate,
  );
}
