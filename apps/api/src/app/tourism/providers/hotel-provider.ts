/**
 * قرارداد مشترک تأمین‌کننده‌های هتل.
 *
 * دو پیاده‌سازی دارد: `HotelyarProvider` (هتل‌یار/WorldGDS) و
 * `Eghamat24Provider` (GRS). `TourismService` فقط همین را می‌شناسد و از اینکه
 * رزرو کجا ثبت می‌شود بی‌خبر است.
 *
 * ── چرا این شکل و نه شکل ساده‌ترِ «یک متد book» ──────────────────────────────
 *
 * دو API جریان رزرو متفاوتی دارند و پورت باید **اشتراک واقعی‌شان** را بگیرد، نه
 * ساده‌ترینشان را:
 *
 *   هتل‌یار:  book() → Booked (قطعی) یا Pending (ظرفیت آفلاین)
 *   اقامت۲۴: reserve() → booking (رزرو نگه داشته شد، مهلت دارد)
 *                      → ما پول می‌گیریم
 *                      → book() → booked → definite
 *
 * پس `reserve()` + `confirm()` جدا هستند. برای هتل‌یار `confirm()` عملاً
 * بی‌اثر است (رزرو همان‌جا نهایی شده)، ولی برای اقامت۲۴ مرحلهٔ واجب است.
 * ترتیب پول در هر دو یکی می‌ماند و همان چیزی است که از قبل داشتیم: **اول رزرو
 * نزد تأمین‌کننده، بعد کسر اعتبار** — برعکسش یعنی هر خطای شبکه اعتبار کارمند
 * را می‌سوزاند بدون اینکه اتاقی گرفته شده باشد.
 *
 * کنسلی هم به همین دلیل دومرحله‌ای است: اقامت۲۴ اول جریمه را اعلام می‌کند
 * (`canceling`) و تا وقتی ما تأیید نکرده‌ایم کنسل نمی‌شود. هتل‌یار کنسلی
 * برنامه‌نویسی‌شده ندارد، پس پیاده‌سازی‌اش `NotImplemented` می‌دهد — عمداً خطا،
 * نه «موفق» دروغین.
 */

import {
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
} from '@sanpay/models';
import { ProviderKey } from './provider-id';

/** پارامترهای جست‌وجو — همه با شناسه‌های مبهم */
export interface ProviderSearchParams {
  /** YYYY-MM-DD */
  checkin: string;
  nights: number;
  /** null یعنی همهٔ هتل‌های شهر */
  hotelId: string | null;
  /** null یعنی همهٔ شهرهای این provider */
  cityId: string | null;
  /** حداقل ستاره؛ ۰ یعنی بدون فیلتر */
  rate: number;
  /** تعداد نفرات هر اتاق */
  capacity: number;
}

export interface ProviderGuest {
  firstName: string;
  lastName: string;
  nationalCode: string;
  mobile: string;
}

export interface ProviderReserveRequest {
  hotelId: string;
  roomId: string;
  /** YYYY-MM-DD */
  checkin: string;
  nights: number;
  guest: ProviderGuest;
  /** شمارهٔ پیگیری داخلی ما — به‌عنوان externalId به تأمین‌کننده می‌رود */
  referenceNo: string;
}

/**
 * وضعیت رزرو از دید ما — عمداً provider-neutral.
 *
 * - `CONFIRMED` رزرو قطعی است، کاری نمانده.
 * - `HOLD` اتاق نگه داشته شده و منتظر `confirm()` ماست؛ `expiresAt` دارد.
 * - `PENDING` تأمین‌کننده/هتل باید تأیید کند؛ نتیجه بعداً از webhook می‌آید.
 * - `REJECTED` رد شد.
 */
export type ProviderReserveStatus =
  | 'CONFIRMED'
  | 'HOLD'
  | 'PENDING'
  | 'REJECTED';

export interface ProviderReserveResult {
  status: ProviderReserveStatus;
  /** شناسهٔ رزرو نزد تأمین‌کننده — برای confirm/cancel و تطبیق webhook */
  reserveRef: string;
  /**
   * مبلغی که ما به تأمین‌کننده بدهکاریم (تومان) — مبنای تسویه، نه مبلغی که از
   * کارمند گرفته‌ایم. اگر تأمین‌کننده تفکیک نداده باشد null است.
   */
  payable: number | null;
  /** مهلت `HOLD`؛ برای بقیهٔ وضعیت‌ها null */
  expiresAt: Date | null;
  /** پیام تأمین‌کننده برای رد شدن — به کارمند نشان داده می‌شود */
  message: string | null;
}

/**
 * نتیجهٔ درخواست کنسلی.
 *
 * - `CANCELED` کنسل شد؛ `refundable` مبلغ برگشتی است.
 * - `CANCELING` جریمه اعلام شد و منتظر `acceptCancel()` ماست.
 * - `REJECTED` تأمین‌کننده کنسلی را نپذیرفت.
 */
export type ProviderCancelStatus = 'CANCELED' | 'CANCELING' | 'REJECTED';

export interface ProviderCancelResult {
  status: ProviderCancelStatus;
  /** مبلغ قابل برگشت به کیف پول (تومان) */
  refundable: number;
  /** جریمهٔ کنسلی که نزد تأمین‌کننده می‌ماند (تومان) */
  penalty: number;
  message: string | null;
}

export abstract class HotelProvider {
  abstract readonly key: ProviderKey;

  // ── کاتالوگ ────────────────────────────────────────────────────────────────

  abstract cities(): Promise<TourismCity[]>;

  /** `cityId` برابر null یعنی همهٔ شهرهای این provider */
  abstract hotels(cityId: string | null): Promise<HotelSummary[]>;

  /** null یعنی این هتل نزد این provider نیست */
  abstract hotel(hotelId: string): Promise<HotelDetail | null>;

  abstract search(params: ProviderSearchParams): Promise<HotelAvailability[]>;

  // ── رزرو ───────────────────────────────────────────────────────────────────

  abstract reserve(
    request: ProviderReserveRequest,
  ): Promise<ProviderReserveResult>;

  /**
   * نهایی‌کردن رزروِ `HOLD` بعد از کسر اعتبار.
   * برای تأمین‌کننده‌ای که رزروش همان اول قطعی می‌شود، بی‌اثر است و همان وضعیت
   * را برمی‌گرداند.
   */
  abstract confirm(reserveRef: string): Promise<ProviderReserveResult>;

  // ── کنسلی ──────────────────────────────────────────────────────────────────

  abstract cancel(reserveRef: string): Promise<ProviderCancelResult>;

  /** تأیید کنسلیِ `CANCELING` بعد از اینکه کارمند جریمه را پذیرفت */
  abstract acceptCancel(reserveRef: string): Promise<ProviderCancelResult>;

  /** انصراف از کنسلی — رزرو سرجایش می‌ماند */
  abstract rejectCancel(reserveRef: string): Promise<ProviderCancelResult>;
}
