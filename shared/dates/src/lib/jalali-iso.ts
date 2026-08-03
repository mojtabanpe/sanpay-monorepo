import { JalaliDate, PersianDate } from '@spartan-ng/brain/date-time';

/**
 * تبدیل بین `YYYY-MM-DD` میلادی (زبان API) و `JalaliDate` که تاریخ‌گزین
 * اسپارتان نشان می‌دهد. تبدیل فقط در همین مرزِ نمایش انجام می‌شود.
 */
export function isoToJalali(isoDate: string): JalaliDate {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const [jy, jm, jd] = PersianDate.gregorianToJalali(year, month, day);
  return new JalaliDate(jy, jm, jd);
}

export function jalaliToIso(date: JalaliDate): string {
  const [gy, gm, gd] = PersianDate.jalaliToGregorian(
    date.year,
    date.month,
    date.day,
  );
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}
