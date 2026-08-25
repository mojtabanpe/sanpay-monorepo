/**
 * انتخاب تأمین‌کننده.
 *
 * قاعدهٔ کسب‌وکار: **هتل‌های مشهد از اقامت۲۴، بقیهٔ شهرها از هتل‌یار.**
 *
 * این قاعده فقط در یک نقطه اعمال می‌شود — ساختن فهرست شهرها — و از آنجا به بعد
 * خودبه‌خود جاری می‌ماند: هر شناسه‌ای که به کلاینت داده‌ایم provider را در خودش
 * دارد، پس هتلِ انتخاب‌شده، اتاق، جست‌وجو و رزرو همه به همان provider می‌روند
 * بدون اینکه لازم باشد دوباره دربارهٔ شهر تصمیم بگیریم.
 */

import { Injectable, Logger } from '@nestjs/common';
import { TourismCity } from '@sanpay/models';
import { Eghamat24Provider } from './eghamat24/eghamat24.provider';
import { HotelProvider } from './hotel-provider';
import { HotelyarProvider } from './hotelyar/hotelyar.provider';
import { PROVIDER_NAMES, ProviderKey, providerOf } from './provider-id';

/**
 * شهرهایی که به اقامت۲۴ می‌روند.
 *
 * با نام تطبیق داده می‌شود نه شناسه، چون شناسهٔ شهر بین دو API یکی نیست و ما
 * جدول تطبیق نداریم. قابل تنظیم با `EGHAMAT24_CITIES` (جدا با کاما) تا اگر
 * فردا شهر دیگری هم به اقامت۲۴ سپرده شد، deploy لازم نباشد.
 */
const DEFAULT_EGHAMAT24_CITIES = ['مشهد'];

@Injectable()
export class HotelProviderRouter {
  private readonly logger = new Logger(HotelProviderRouter.name);

  private readonly providers: Record<ProviderKey, HotelProvider>;

  /** نام نرمال‌شدهٔ شهرهایی که اقامت۲۴ سرویس‌شان می‌دهد */
  private readonly eghamat24Cities: string[];

  constructor(
    private readonly hotelyar: HotelyarProvider,
    private readonly eghamat24: Eghamat24Provider,
  ) {
    this.providers = { hy: hotelyar, eg: eghamat24 };

    const configured = (process.env.EGHAMAT24_CITIES ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    this.eghamat24Cities = (
      configured.length > 0 ? configured : DEFAULT_EGHAMAT24_CITIES
    ).map(normalizeCityName);
  }

  /** همهٔ تأمین‌کننده‌ها — برای عملیاتی که باید روی هر دو اجرا شود */
  all(): HotelProvider[] {
    return [this.hotelyar, this.eghamat24];
  }

  byKey(key: ProviderKey): HotelProvider {
    return this.providers[key];
  }

  /** تأمین‌کنندهٔ صاحب یک شناسه */
  forId(id: string): HotelProvider {
    return this.providers[providerOf(id)];
  }

  /**
   * فهرست شهرهای هر دو تأمین‌کننده، با اعمال قاعدهٔ تقسیم.
   *
   * اگر یکی از دو سرویس بالا نیامد، شهرهای دیگری همچنان برمی‌گردند — نبودِ
   * اقامت۲۴ نباید کل تب گردشگری را از کار بیندازد. خطا لاگ می‌شود تا بی‌صدا
   * نماند.
   */
  async cities(): Promise<TourismCity[]> {
    const [hotelyarCities, eghamat24Cities] = await Promise.all([
      this.safeCities(this.hotelyar),
      this.safeCities(this.eghamat24),
    ]);

    return [
      // شهرهای اقامت۲۴: فقط آن‌هایی که به آن سپرده شده‌اند
      ...eghamat24Cities.filter((city) => this.servedByEghamat24(city.name)),
      // هتل‌یار: هر شهری جز آن‌ها
      ...hotelyarCities.filter((city) => !this.servedByEghamat24(city.name)),
    ].sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }

  /**
   * آیا این شهر به اقامت۲۴ سپرده شده؟
   *
   * تطبیق «شامل‌بودن» است نه برابری، چون دو API یک شهر را یکسان نمی‌نویسند —
   * اقامت۲۴ «مشهد مقدس» می‌دهد و هتل‌یار «مشهد». برابری دقیق باعث می‌شد مشهدِ
   * هتل‌یار فیلتر نشود و شهر تکراری در فهرست بیفتد.
   */
  servedByEghamat24(cityName: string): boolean {
    const normalized = normalizeCityName(cityName);
    return this.eghamat24Cities.some(
      (owned) => normalized.includes(owned) || owned.includes(normalized),
    );
  }

  private async safeCities(provider: HotelProvider): Promise<TourismCity[]> {
    try {
      return await provider.cities();
    } catch (error) {
      this.logger.error(
        `دریافت فهرست شهرهای ${PROVIDER_NAMES[provider.key]} ناموفق بود`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }
}

/**
 * نرمال‌سازی نام شهر برای تطبیق.
 *
 * «ی/ک» عربی و فارسی، نیم‌فاصله و فاصله‌های اضافه یکدست می‌شوند؛ بدون این کار
 * «مشهد» با «مشهد » یا نگارش عربیِ همان کلمه برابر نمی‌شد.
 */
function normalizeCityName(name: string): string {
  return (name ?? '')
    .replace(/[يى]/g, 'ی') // ي، ى → ی
    .replace(/ك/g, 'ک') // ك → ک
    .replace(/‌/g, ' ') // نیم‌فاصله → فاصله
    .replace(/\s+/g, ' ')
    .trim();
}
