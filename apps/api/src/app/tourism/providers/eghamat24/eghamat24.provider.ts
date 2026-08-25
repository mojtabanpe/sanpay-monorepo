/**
 * تأمین‌کنندهٔ اقامت۲۴ / GRS.
 *
 * کار اصلی این کلاس نگاشتِ جریان چهارمرحله‌ایِ GRS به قرارداد دومرحله‌ایِ پورت
 * است:
 *
 *     GRS:   reserve → booking(مهلت‌دار) → [ما پول می‌گیریم] → book → definite
 *     پورت:  reserve → HOLD             → [ما پول می‌گیریم] → confirm → CONFIRMED
 *
 * و همچنین ترجمهٔ ۱۵ وضعیت GRS به پنج وضعیتی که سان‌پی می‌شناسد. هر وضعیتی که
 * نشناسیم عمداً `PENDING` می‌شود نه `CONFIRMED`: وضعیت ناشناخته یعنی نمی‌دانیم
 * رزرو قطعی شده یا نه، و «قطعی» فرض‌کردنش یعنی به کارمند بگوییم اتاقی دارد که
 * شاید ندارد.
 */

import { BadRequestException, Injectable } from '@nestjs/common';
import {
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
} from '@sanpay/models';
import {
  HotelProvider,
  ProviderCancelResult,
  ProviderCancelStatus,
  ProviderReserveRequest,
  ProviderReserveResult,
  ProviderReserveStatus,
  ProviderSearchParams,
} from '../hotel-provider';
import { ProviderKey, decodeId, decodeNumericId } from '../provider-id';
import {
  rialToToman,
  suggestionToAvailability,
  toAvailability,
  toCity,
  toHotelDetail,
  toHotelSummary,
} from './eghamat24.mapper';
import { parseGrsStamp } from './grs-time';
import { GrsClient, GrsReserveDetails, GrsReserveStatus } from './grs.types';

const CATALOG_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class Eghamat24Provider extends HotelProvider {
  readonly key: ProviderKey = 'eg';

  private cityCache: { at: number; value: TourismCity[] } | null = null;

  constructor(private readonly grs: GrsClient) {
    super();
  }

  async cities(): Promise<TourismCity[]> {
    if (this.cityCache && Date.now() - this.cityCache.at < CATALOG_TTL_MS) {
      return this.cityCache.value;
    }
    const value = (await this.grs.getCities()).map(toCity);
    this.cityCache = { at: Date.now(), value };
    return value;
  }

  async hotels(cityId: string | null): Promise<HotelSummary[]> {
    const [properties, cityNames] = await Promise.all([
      this.grs.getProperties(cityId === null ? null : decodeNumericId(cityId).id),
      this.cityNames(),
    ]);
    return properties.map((property) => toHotelSummary(property, cityNames));
  }

  async hotel(hotelId: string): Promise<HotelDetail | null> {
    const [property, cityNames] = await Promise.all([
      this.grs.getPropertyDetails(decodeNumericId(hotelId).id),
      this.cityNames(),
    ]);
    return property ? toHotelDetail(property, cityNames) : null;
  }

  /**
   * جست‌وجو.
   *
   * دو مسیر دارد چون GRS دو سرویس جدا دارد و هرکدام جای خودش دقیق‌تر است:
   * `available-rooms` برای یک اقامتگاه مشخص نرخ و موجودی **روزانه** می‌دهد
   * (چیزی که برای صفحهٔ هتل لازم داریم)، و `suggestion` برای جست‌وجوی شهری
   * فقط جمع‌بندی می‌دهد ولی یک تماس به‌جای N تماس است.
   */
  async search(params: ProviderSearchParams): Promise<HotelAvailability[]> {
    const checkout = addDays(params.checkin, params.nights);

    if (params.hotelId) {
      const propertyId = decodeNumericId(params.hotelId).id;
      const [property, rooms] = await Promise.all([
        this.grs.getPropertyDetails(propertyId),
        this.grs.getAvailableRooms(propertyId, params.checkin, checkout),
      ]);

      if (!property) {
        return [];
      }

      const availability = toAvailability(
        propertyId,
        property.name,
        params.checkin,
        checkout,
        params.nights,
        rooms,
      );

      const rooms_ = availability.rooms.filter(
        (room) => room.capacity >= params.capacity,
      );
      return rooms_.length > 0 ? [{ ...availability, rooms: rooms_ }] : [];
    }

    const suggestions = await this.grs.suggestion({
      cityId: params.cityId ? decodeNumericId(params.cityId).id : null,
      propertyId: null,
      checkIn: params.checkin,
      checkOut: checkout,
      adultsCount: params.capacity,
      star: params.rate,
    });

    return suggestions
      .map((suggestion) =>
        suggestionToAvailability(
          suggestion,
          params.checkin,
          checkout,
          params.nights,
        ),
      )
      .filter((availability) => availability.rooms.length > 0);
  }

  /**
   * ثبت درخواست رزرو.
   *
   * شناسهٔ اتاق سه‌بخشی است (`eg:ملک:نوع اتاق:نرخ‌نامه`) و هر سه بخش لازم است؛
   * ضمناً بخش «ملک» باید با `hotelId` بخواند، وگرنه داریم اتاق یک اقامتگاه را
   * در اقامتگاه دیگری رزرو می‌کنیم.
   */
  async reserve(
    request: ProviderReserveRequest,
  ): Promise<ProviderReserveResult> {
    const propertyId = decodeNumericId(request.hotelId).id;
    const { parts } = decodeId(request.roomId);

    if (parts.length !== 3) {
      throw new BadRequestException('شناسهٔ اتاق نامعتبر است');
    }

    const [roomProperty, roomTypeId, ratePlanId] = parts.map(Number);

    if (roomProperty !== propertyId) {
      throw new BadRequestException('اتاق انتخاب‌شده به این اقامتگاه تعلق ندارد');
    }

    const details = await this.grs.reserve({
      property_id: propertyId,
      check_in: request.checkin,
      check_out: addDays(request.checkin, request.nights),
      booker_first_name: request.guest.firstName,
      booker_last_name: request.guest.lastName,
      booker_phone: request.guest.mobile,
      booker_email: null,
      agency_confirmation_code: request.referenceNo,
      description: null,
      rooms: [
        {
          room_type_id: roomTypeId,
          rate_plan_id: ratePlanId,
          // داکیومنت: فعلاً باید ۱ باشد
          count: 1,
          adult_count: 1,
          children: [],
          guest_first_name: request.guest.firstName,
          guest_last_name: request.guest.lastName,
          guest_phone: request.guest.mobile,
          guest_email: '',
          guest_national_code: request.guest.nationalCode,
          guest_passport_number: '',
          guest_country_id: null,
          guest_city_id: null,
        },
      ],
    });

    return toReserveResult(details);
  }

  /** نهایی‌سازی رزروِ `HOLD` — همان `POST /v1/book` */
  async confirm(reserveRef: string): Promise<ProviderReserveResult> {
    return toReserveResult(await this.grs.book(reserveRef));
  }

  async cancel(reserveRef: string): Promise<ProviderCancelResult> {
    return toCancelResult(await this.grs.cancel(reserveRef));
  }

  async acceptCancel(reserveRef: string): Promise<ProviderCancelResult> {
    return toCancelResult(await this.grs.acceptCancel(reserveRef));
  }

  async rejectCancel(reserveRef: string): Promise<ProviderCancelResult> {
    return toCancelResult(await this.grs.rejectCancel(reserveRef));
  }

  private async cityNames(): Promise<Map<number, string>> {
    const cities = await this.cities();
    return new Map(
      cities.map((city) => [decodeNumericId(city.id).id, city.name]),
    );
  }
}

/** ترجمهٔ وضعیت GRS به وضعیت پورت */
const RESERVE_STATUS: Partial<Record<GrsReserveStatus, ProviderReserveStatus>> =
  {
    // اتاق نگه داشته شده و مهلت دارد — باید confirm() بزنیم
    booking: 'HOLD',
    // اپراتور اقامتگاه باید چک کند؛ نتیجه بعداً از webhook می‌آید
    pending: 'PENDING',
    booked: 'CONFIRMED',
    definite: 'CONFIRMED',
    rejected: 'REJECTED',
    overbooking: 'REJECTED',
  };

function toReserveResult(details: GrsReserveDetails): ProviderReserveResult {
  return {
    // ناشناخته → PENDING، نه CONFIRMED (بالای فایل توضیح داده شده)
    status: RESERVE_STATUS[details.status] ?? 'PENDING',
    reserveRef: details.confirmation_code,
    // بدهی ما به اقامت۲۴ نرخ GRS است، نه نرخ برد
    payable: rialToToman(details.total_sales_price) || null,
    expiresAt: parseGrsStamp(details.expire_date),
    message: details.description || null,
  };
}

const CANCEL_STATUS: Partial<Record<GrsReserveStatus, ProviderCancelStatus>> = {
  canceled: 'CANCELED',
  canceling: 'CANCELING',
  cancellation_rejected: 'REJECTED',
};

function toCancelResult(details: GrsReserveDetails): ProviderCancelResult {
  const penalty = rialToToman(details.total_canellation_fee ?? 0);
  const paid = rialToToman(details.total_sales_price);

  return {
    status: CANCEL_STATUS[details.status] ?? 'REJECTED',
    // منفی‌نشدن مهم است: جریمه‌ای بزرگ‌تر از مبلغ رزرو نباید به «برگشت منفی»
    // ترجمه شود و از کیف پول کارمند کم کند
    refundable: Math.max(0, paid - penalty),
    penalty,
    message: details.description || null,
  };
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
