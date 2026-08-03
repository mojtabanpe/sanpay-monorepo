/** قالب‌بندی فارسی مشترک صفحه‌های فروشگاه */

const NUMBER = new Intl.NumberFormat('fa-IR');

export function faNumber(value: number): string {
  return NUMBER.format(value);
}

export function toman(value: number): string {
  return `${NUMBER.format(value)} تومان`;
}
