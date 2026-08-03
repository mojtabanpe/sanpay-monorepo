/**
 * تاریخ شمسی برای همهٔ تقویم‌ها و تاریخ‌گزین‌های اسپارتان.
 *
 * `@spartan-ng/brain` خودش `BrnJalaliDateAdapter` را دارد؛ اینجا فقط آن را به
 * ریشهٔ اپ وصل می‌کنیم و برچسب‌های فارسی (نام ماه‌ها، روزهای هفته، ارقام ۱۲۳)
 * را روی تقویم می‌نشانیم. چون provider ها در ریشه‌اند، همهٔ اپلت‌ها هم بدون
 * وابستگی به اپ همین رفتار را می‌گیرند.
 */
import type { Provider } from '@angular/core';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import {
  BrnJalaliDateAdapter,
  JalaliDate,
  provideDateAdapter,
} from '@spartan-ng/brain/date-time';
import { provideHlmDatePickerConfig } from '@sanpay/ui/date-picker';

const MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** ایندکس ۰ = یکشنبه، مطابق قرارداد `getDay` در آداپتور */
const WEEKDAYS_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'] as const;
const WEEKDAYS_LONG = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه',
] as const;

const DIGITS = new Intl.NumberFormat('fa-IR', { useGrouping: false });

/** «۱۴۰۵» — بدون جداکنندهٔ هزارگان، وگرنه سال «۱٬۴۰۵» می‌شود */
function faDigits(value: number): string {
  return DIGITS.format(value);
}

function pad(value: number): string {
  return faDigits(value).padStart(2, '۰');
}

/** «۱۴۰۵/۰۶/۳۱» — همان قالبی که بقیهٔ اپ نشان می‌دهد */
export function formatJalali(date: JalaliDate): string {
  return `${faDigits(date.year)}/${pad(date.month)}/${pad(date.day)}`;
}

/** «۱۴۰۵/۰۶/۳۱» با ارقام لاتین — قالبی که کاربر هنگام تایپ وارد می‌کند */
function formatJalaliInput(date: JalaliDate): string {
  return `${date.year}/${String(date.month).padStart(2, '0')}/${String(
    date.day,
  ).padStart(2, '0')}`;
}

/** ارقام فارسی/عربی را به لاتین برمی‌گرداند تا تایپ با کیبورد فارسی هم کار کند */
function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function parseJalali(value: string): JalaliDate | null {
  const match = toLatinDigits(value)
    .trim()
    .match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  // ماه/روز خارج از محدوده را رد می‌کنیم تا آداپتور بی‌صدا آن را نبُرد
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new JalaliDate(year, month, day);
}

/** روی `app.config.ts` بنشانید تا کل اپ تقویم شمسی بگیرد. */
export function providePersianDates(): Provider[] {
  return [
    provideDateAdapter(BrnJalaliDateAdapter),
    provideBrnCalendarI18n({
      // هفتهٔ ایرانی از شنبه شروع می‌شود (۶ در قرارداد ۰=یکشنبه)
      firstDayOfWeek: () => 6,
      months: () => [...MONTHS],
      formatMonth: (month) => MONTHS[month],
      formatYear: (year) => faDigits(year),
      formatHeader: (month, year) => `${MONTHS[month]} ${faDigits(year)}`,
      formatWeekdayName: (index) => WEEKDAYS_SHORT[index],
      labelWeekday: (index) => WEEKDAYS_LONG[index],
      labelPrevious: () => 'ماه قبل',
      labelNext: () => 'ماه بعد',
      years: (startYear, endYear) => {
        const now = new BrnJalaliDateAdapter().now().year;
        const from = startYear ?? now - 100;
        const to = endYear ?? now + 10;
        return Array.from({ length: to - from + 1 }, (_, i) => from + i);
      },
    }),
    provideHlmDatePickerConfig<JalaliDate>({
      autoCloseOnSelect: true,
      formatDate: formatJalali,
      formatInputDate: formatJalaliInput,
      parseDate: parseJalali,
    }),
  ];
}
