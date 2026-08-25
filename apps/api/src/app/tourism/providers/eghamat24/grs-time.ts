/**
 * مهرهای زمانی GRS.
 *
 * GRS تاریخ‌ها را به شکل `"YYYY-MM-DD HH:mm:ss"` **بدون منطقهٔ زمانی** می‌دهد و
 * چون سرویس ایرانی است، وقت تهران است. اگر این رشته را مستقیم به `Date.parse`
 * بدهیم، جاوااسکریپت آن را وقت محلیِ ماشین می‌خواند و روی سروری با ساعت UTC
 * ۳ ساعت و نیم جابه‌جا می‌شود.
 *
 * این جابه‌جایی بی‌سروصدا نیست: مهلت رزروِ `booking` حدود ۲۰ دقیقه است، پس
 * ۳:۳۰ خطا یعنی هر رزرو در لحظهٔ ساخت «منقضی» به نظر می‌رسد و نهایی‌سازی همیشه
 * شکست می‌خورد. دقیقاً همین اتفاق افتاد و تست ماک گرفتش.
 *
 * ساخت و خواندن هر دو اینجا هستند تا متقارن بمانند — ماک همان شکلی می‌نویسد
 * که کلاینت واقعی می‌خواند.
 */

/** اختلاف ثابت ایران با UTC؛ ایران از ۱۴۰۱ ساعت تابستانی ندارد */
const TEHRAN_OFFSET = '+03:30';

/** `"1405-06-03 14:20:00"` → `Date`؛ ورودی خراب → null */
export function parseGrsStamp(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(`${value.trim().replace(' ', 'T')}${TEHRAN_OFFSET}`);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

/** `Date` → `"YYYY-MM-DD HH:mm:ss"` به وقت تهران */
export function formatGrsStamp(date: Date): string {
  const tehran = new Date(date.getTime() + 3.5 * 60 * 60 * 1000);
  return tehran.toISOString().slice(0, 19).replace('T', ' ');
}
