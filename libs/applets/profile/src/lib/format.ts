/** قالب‌بندی فارسی مشترک صفحه‌های پروفایل */

const NUMBER = new Intl.NumberFormat('fa-IR');
const JALALI = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const JALALI_TIME = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function faNumber(value: number): string {
  return NUMBER.format(value);
}

export function toman(value: number): string {
  return `${NUMBER.format(value)} تومان`;
}

export function jalali(iso: string): string {
  return JALALI.format(new Date(iso));
}

export function jalaliTime(iso: string): string {
  return JALALI_TIME.format(new Date(iso));
}

/** «۱۲ روز» تا انقضا — منفی یعنی گذشته */
export function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}
