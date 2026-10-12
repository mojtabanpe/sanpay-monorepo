/**
 * منطق خالصِ ورودی مبلغ — جدا از directive تا بدون DOM تست شود.
 *
 * مقدار مدل همیشه رشتهٔ ارقام لاتینِ بدون جداکننده است («50000»)؛ فقط متن
 * داخل input جداکنندهٔ سه‌رقمی می‌گیرد («50٬000»). ارقام DOM لاتین می‌مانند،
 * چون فونت Vazirmatn FD آن‌ها را فارسی رسم می‌کند و parse/کپی ساده می‌ماند.
 */

/** جداکنندهٔ هزارگان فارسی (U+066C) */
export const THOUSANDS_SEPARATOR = '٬';

/** ارقام فارسی و عربی را لاتین می‌کند */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

/**
 * متن کاربر → رشتهٔ ارقام لاتین، بدون صفرهای ابتدایی؛ با `max` بالاتر از
 * سقف به خود سقف می‌رسد.
 */
export function normalizeAmount(raw: string, max?: number | null): string {
  const digits = toLatinDigits(raw).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (digits === '' || max === null || max === undefined) return digits;
  return Number(digits) > max ? String(Math.max(0, Math.floor(max))) : digits;
}

/** «50000» → «50٬000» */
export function formatAmount(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
}

export function countDigits(value: string): number {
  return toLatinDigits(value).replace(/\D/g, '').length;
}

/** جایگاهی در `text` که دقیقاً `digitsAfter` رقم بعد از آن باشد */
export function caretBeforeDigits(text: string, digitsAfter: number): number {
  let seen = 0;
  for (let i = text.length; i > 0; i--) {
    if (seen >= digitsAfter) return i;
    if (/\d/.test(toLatinDigits(text[i - 1]))) seen++;
  }
  return 0;
}
