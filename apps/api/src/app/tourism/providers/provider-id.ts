/**
 * شناسه‌های مبهمِ provider-دار.
 *
 * چرا: دو تأمین‌کنندهٔ هتل داریم (هتل‌یار و اقامت۲۴) و شناسه‌های عددی‌شان با هم
 * تداخل دارند — هتل ۷۴۰ در اقامت۲۴ هیچ ربطی به هتل ۷۴۰ در هتل‌یار ندارد. به‌جای
 * حمل‌کردن یک فیلد `provider` کنار هر شناسه در همهٔ route‌ها و query paramها،
 * خودِ شناسه provider را حمل می‌کند. نتیجه این است که مسیریابی تقریباً مجانی
 * به دست می‌آید: هر جا شناسه‌ای داریم، می‌دانیم باید سراغ کدام provider برویم.
 *
 * سود دوم: ساختار شناسهٔ اتاق بین دو provider یکی نیست. هتل‌یار با یک `roomId`
 * رزرو می‌کند، ولی اقامت۲۴ هم `room_type_id` می‌خواهد و هم `rate_plan_id`. یک
 * شناسهٔ چندبخشی هر دو را جا می‌دهد بدون اینکه مدل مشترک آلوده شود.
 *
 *     hy:1234          هتل ۱۲۳۴ در هتل‌یار
 *     eg:740           اقامتگاه ۷۴۰ در اقامت۲۴
 *     eg:740:12:5      اقامتگاه ۷۴۰، نوع اتاق ۱۲، نرخ‌نامهٔ ۵
 *
 * **این رشته برای کلاینت مبهم است.** فرانت هیچ‌وقت پارسش نمی‌کند و فقط همان
 * چیزی را که گرفته پس می‌دهد؛ هر تغییری در ساختار داخلی باید بدون دست‌زدن به
 * اپ کارمند ممکن باشد.
 */

import { BadRequestException } from '@nestjs/common';

/** کلید هر تأمین‌کننده — همان پیشوندی که در شناسه‌ها می‌آید */
export type ProviderKey = 'hy' | 'eg';

export const PROVIDER_KEYS: readonly ProviderKey[] = ['hy', 'eg'];

/** نام فارسی برای پیام‌های خطا و لاگ */
export const PROVIDER_NAMES: Record<ProviderKey, string> = {
  hy: 'هتل‌یار',
  eg: 'اقامت۲۴',
};

export interface DecodedId {
  provider: ProviderKey;
  /** بخش‌های بعد از پیشوند — همیشه حداقل یکی */
  parts: string[];
}

const SEPARATOR = ':';

/** ساخت شناسه: `encode('eg', 740, 12, 5)` → `"eg:740:12:5"` */
export function encodeId(
  provider: ProviderKey,
  ...parts: (string | number)[]
): string {
  if (parts.length === 0) {
    throw new Error('encodeId: at least one part required');
  }
  return [provider, ...parts].join(SEPARATOR);
}

/**
 * تجزیهٔ شناسه. ورودی نامعتبر `BadRequestException` می‌دهد نه `null` — چون این
 * شناسه‌ها همیشه از خروجی خودمان می‌آیند، پس شکل خراب یعنی کلاینت دستکاری
 * کرده و باید ۴۰۰ بگیرد، نه اینکه بی‌صدا به provider پیش‌فرض بیفتد.
 */
export function decodeId(value: string): DecodedId {
  const [provider, ...parts] = (value ?? '').split(SEPARATOR);

  if (!isProviderKey(provider) || parts.length === 0 || parts.some((p) => !p)) {
    throw new BadRequestException('شناسهٔ نامعتبر');
  }

  return { provider, parts };
}

/** تجزیهٔ شناسهٔ تک‌بخشی و برگرداندن بخش عددی — رایج‌ترین حالت */
export function decodeNumericId(value: string): {
  provider: ProviderKey;
  id: number;
} {
  const { provider, parts } = decodeId(value);
  const id = Number(parts[0]);

  if (!Number.isFinite(id)) {
    throw new BadRequestException('شناسهٔ نامعتبر');
  }

  return { provider, id };
}

/** فقط provider را می‌خواهیم، بدون اهمیت به بقیهٔ بخش‌ها */
export function providerOf(value: string): ProviderKey {
  return decodeId(value).provider;
}

export function isProviderKey(value: string): value is ProviderKey {
  return (PROVIDER_KEYS as readonly string[]).includes(value);
}

/**
 * تضمین اینکه چند شناسه از یک provider هستند.
 *
 * لازم است چون یک درخواست می‌تواند `hotelId` از هتل‌یار و `roomId` از اقامت۲۴
 * بیاورد — یا از باگ فرانت، یا از دستکاری. بدون این چک، آن درخواست به یکی از
 * دو provider می‌رفت و شناسهٔ بی‌ربط دیگری را به آن پاس می‌دادیم.
 */
export function sameProvider(...ids: string[]): ProviderKey {
  const [first, ...rest] = ids.map(providerOf);

  if (rest.some((key) => key !== first)) {
    throw new BadRequestException(
      'شناسه‌های این درخواست به تأمین‌کننده‌های مختلفی تعلق دارند',
    );
  }

  return first;
}
