/**
 * تأمین‌کنندهٔ هتل‌یار / WorldGDS.
 *
 * لایهٔ نازکی روی `GdsClient` است: شناسه‌های خام را به شناسه‌های مبهم `hy:*`
 * تبدیل می‌کند و جریان رزروِ یک‌مرحله‌ایِ هتل‌یار را در قالب دومرحله‌ایِ پورت
 * جا می‌دهد.
 */

import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
} from '@sanpay/models';
import {
  HotelProvider,
  ProviderCancelResult,
  ProviderReserveRequest,
  ProviderReserveResult,
  ProviderSearchParams,
} from '../hotel-provider';
import { ProviderKey, decodeNumericId } from '../provider-id';
import { GdsBookResponse, GdsClient } from './gds.types';
import {
  toAvailability,
  toCity,
  toHotelDetail,
  toHotelSummary,
} from './hotelyar.mapper';

/** فهرست شهرها و هتل‌ها تقریباً ثابت است — کش کوتاه، جلوی رفت‌وبرگشت اضافه */
const CATALOG_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class HotelyarProvider extends HotelProvider {
  readonly key: ProviderKey = 'hy';

  private cityCache: { at: number; value: TourismCity[] } | null = null;

  constructor(private readonly gds: GdsClient) {
    super();
  }

  async cities(): Promise<TourismCity[]> {
    if (this.cityCache && Date.now() - this.cityCache.at < CATALOG_TTL_MS) {
      return this.cityCache.value;
    }
    const value = (await this.gds.getCities()).map(toCity);
    this.cityCache = { at: Date.now(), value };
    return value;
  }

  async hotels(cityId: string | null): Promise<HotelSummary[]> {
    // ‎-۱ قرارداد خودِ هتل‌یار برای «همهٔ شهرها» است
    const localCityId = cityId === null ? -1 : decodeNumericId(cityId).id;
    const [hotels, cityNames] = await Promise.all([
      this.gds.getHotels(localCityId),
      this.cityNames(),
    ]);
    return hotels.map((hotel) => toHotelSummary(hotel, cityNames));
  }

  async hotel(hotelId: string): Promise<HotelDetail | null> {
    const [hotel, cityNames] = await Promise.all([
      this.gds.getHotel(decodeNumericId(hotelId).id),
      this.cityNames(),
    ]);

    // TODO(هتل‌یار): اگر getHotelImages درست و سریع شد، دوباره به‌عنوان منبع
    // دوم گالری اضافه شود — مپر آرگومان `gallery` را همچنان می‌پذیرد.
    // getHotelImages عمداً صدا زده نمی‌شود: روی API واقعی همیشه `{list: null}`
    // برمی‌گرداند ولی ۱۰ تا ۲۰ ثانیه طول می‌کشد، و چون await می‌شد کل صفحهٔ
    // هتل را همان‌قدر معطل می‌کرد (۲۱ ثانیه اندازه‌گیری شد). گالری واقعی داخل
    // خودِ getHotel است و مپر از همان می‌خواند.
    return hotel ? toHotelDetail(hotel, cityNames, []) : null;
  }

  /**
   * جست‌وجوی اتاق‌های خالی.
   *
   * «همیشه خالی برمی‌گردد» حل شد: علت نبودِ `hotelCapacityType` در بدنه بود، نه
   * خالی‌بودن حساب دمو. `GdsHttpClient.searchHotel` آن را اضافه می‌کند.
   */
  async search(params: ProviderSearchParams): Promise<HotelAvailability[]> {
    const results = await this.gds.searchHotel({
      checkin: params.checkin,
      nights: params.nights,
      hotelId: params.hotelId ? decodeNumericId(params.hotelId).id : 0,
      cityId: params.cityId ? decodeNumericId(params.cityId).id : -1,
      rate: params.rate,
      // capacityId=1 یعنی «ظرفیت مساوی یا بیشتر از مقدار خواسته‌شده»
      capacityId: 1,
      capacity: params.capacity,
      person: params.capacity,
      lang: 2,
      isForeigner: 0,
      detail: 0,
    });

    return results
      .map(toAvailability)
      .filter((availability) => availability.rooms.length > 0);
  }

  /**
   * رزرو نزد هتل‌یار.
   *
   * هتل‌یار مرحلهٔ «نگه‌داشتن» ندارد؛ همین یک تماس رزرو را نهایی می‌کند. پس
   * خروجی هیچ‌وقت `HOLD` نیست: `statusCode 1` یعنی ظرفیت آنلاین و قطعی،
   * `0` یعنی ظرفیت آفلاین و منتظر تأیید بعدی که از webhook می‌آید.
   */
  async reserve(
    request: ProviderReserveRequest,
  ): Promise<ProviderReserveResult> {
    const response = await this.gds.book({
      firstname: request.guest.firstName,
      lastname: request.guest.lastName,
      email: '',
      tel: '',
      mobile: request.guest.mobile,
      hotelId: decodeNumericId(request.hotelId).id,
      externalId: request.referenceNo,
      checkin: request.checkin,
      night: request.nights,
      isForeigner: 0,
      passenger: [
        {
          roomId: String(decodeNumericId(request.roomId).id),
          name: request.guest.firstName,
          family: request.guest.lastName,
          early: '0',
          late: '0',
          description: '',
          mobile: request.guest.mobile,
          idNo: request.guest.nationalCode,
          extraPerson: [],
        },
      ],
    });

    return {
      status: response.statusCode === '1' ? 'CONFIRMED' : 'PENDING',
      reserveRef: response.reserve?.info?.id ?? '',
      payable: sumHotelPrice(response) || null,
      expiresAt: null,
      message: response.message || null,
    };
  }

  /**
   * بی‌اثر — رزرو هتل‌یار همان اول نهایی شده است.
   *
   * چیزی برای تماس‌گرفتن نیست و وضعیت فعلی هم از این API قابل استعلام نیست، پس
   * `CONFIRMED` برمی‌گردانیم. `TourismService` برای هتل‌یار اصلاً به اینجا
   * نمی‌رسد، چون `reserve()` هیچ‌وقت `HOLD` نمی‌دهد.
   */
  async confirm(reserveRef: string): Promise<ProviderReserveResult> {
    return {
      status: 'CONFIRMED',
      reserveRef,
      payable: null,
      expiresAt: null,
      message: null,
    };
  }

  // ── کنسلی ──────────────────────────────────────────────────────────────────
  //
  // هتل‌یار در داکیومنت v6.3 متد کنسلی برای آژانس ندارد؛ کنسلی از سمت آن‌ها
  // انجام می‌شود و فقط به‌صورت رویداد `change` از webhook به ما می‌رسد.
  // عمداً خطا می‌دهیم به‌جای «موفق» دروغین: اگر روزی کنسلی در UI باز شد، این
  // خطا فوراً دیده می‌شود، ولی یک no-op ساکت یعنی کارمند فکر کند رزروش کنسل
  // شده در حالی که هتل هنوز منتظر اوست.

  async cancel(): Promise<ProviderCancelResult> {
    throw new NotImplementedException(
      'کنسلی رزروهای هتل‌یار از طریق اپ ممکن نیست؛ با واحد رفاه تماس بگیرید',
    );
  }

  async acceptCancel(): Promise<ProviderCancelResult> {
    throw new NotImplementedException(
      'کنسلی رزروهای هتل‌یار از طریق اپ ممکن نیست؛ با واحد رفاه تماس بگیرید',
    );
  }

  async rejectCancel(): Promise<ProviderCancelResult> {
    throw new NotImplementedException(
      'کنسلی رزروهای هتل‌یار از طریق اپ ممکن نیست؛ با واحد رفاه تماس بگیرید',
    );
  }

  private async cityNames(): Promise<Map<number, string>> {
    const cities = await this.cities();
    return new Map(
      cities.map((city) => [decodeNumericId(city.id).id, city.name]),
    );
  }
}

/** جمع hotelPrice همهٔ شب‌ها و مسافرها — بدهی ما به هتل‌یار */
function sumHotelPrice(response: GdsBookResponse): number {
  return (response.reserve?.passenger ?? []).reduce(
    (total, passenger) =>
      total +
      (passenger.dayPrice ?? []).reduce(
        (sum, day) => sum + (day.hotelPrice ?? 0),
        0,
      ),
    0,
  );
}
