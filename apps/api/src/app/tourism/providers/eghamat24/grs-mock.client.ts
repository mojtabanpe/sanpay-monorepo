/**
 * ماک اقامت۲۴ برای توسعه بدون `Client-Token` واقعی.
 *
 * برخلاف هتل‌یار که محیط دمو دارد، اقامت۲۴ تا **پیش از پرداخت حق اشتراک و ارسال
 * مدارک ثبتی** هیچ توکنی نمی‌دهد (فایل «مدارک مورد نیاز وب سرویس»). پس تا آن
 * موقع این ماک تنها راه توسعهٔ مسیر مشهد است و عمداً وفادار به جزئیات آزارندهٔ
 * API واقعی نوشته شده:
 *
 * - قیمت‌ها **ریال**‌اند (اقامتگاه ۷۴۰: شبی ۴٬۵۰۰٬۰۰۰ ریال = ۴۵۰٬۰۰۰ تومان).
 * - نرخ و موجودی **روزانه**‌اند، نه کل بازه؛ و یکی از اقامتگاه‌ها عمداً یک شب
 *   بستهٔ وسط بازه دارد تا منطق «کمینهٔ موجودی» تست‌پذیر بماند.
 * - جریان چهارمرحله‌ای واقعی است: `reserve` → `booking` → `book` → `definite`.
 *   اقامتگاه ۷۴۲ عمداً `pending` می‌دهد (ظرفیت آفلاین) تا آن مسیر هم تست شود.
 * - کنسلی دومرحله‌ای است: `cancel` → `canceling` با جریمه → `accept-cancel`.
 *
 * تصاویر data URI درون‌خطی‌اند چون CDN خارجی در ایران قابل اتکا نیست — همان
 * دلیلی که در ماک هتل‌یار هم بود.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { formatGrsStamp, parseGrsStamp } from './grs-time';
import {
  GrsCity,
  GrsClient,
  GrsProperty,
  GrsPropertyDetails,
  GrsRatePlan,
  GrsRatePlanPrice,
  GrsReserveDetails,
  GrsReserveRequest,
  GrsRoomRate,
  GrsSuggestion,
  GrsSuggestionParams,
} from './grs.types';

/** مهلت نهایی‌سازی رزروِ booking — در سرویس واقعی هم حدود همین است */
const HOLD_MINUTES = 20;

@Injectable()
export class GrsMockClient extends GrsClient {
  private readonly logger = new Logger(GrsMockClient.name);

  /** رزروهای ساخته‌شده در همین پروسه — با ری‌استارت پاک می‌شوند */
  private readonly reserves = new Map<string, GrsReserveDetails>();

  constructor() {
    super();
    this.logger.warn(
      'کلاینت اقامت۲۴ در حالت ماک است — هیچ رزرو واقعی ثبت نمی‌شود',
    );
  }

  async getCities(): Promise<GrsCity[]> {
    return CITIES;
  }

  async getProperties(cityId: number | null): Promise<GrsProperty[]> {
    return cityId === null
      ? PROPERTIES
      : PROPERTIES.filter((property) => property.city_id === cityId);
  }

  async getPropertyDetails(
    propertyId: number,
  ): Promise<GrsPropertyDetails | null> {
    return PROPERTIES.find((property) => property.id === propertyId) ?? null;
  }

  async getAvailableRooms(
    propertyId: number,
    checkIn: string,
    checkOut: string,
  ): Promise<GrsRoomRate[]> {
    const property = await this.getPropertyDetails(propertyId);
    if (!property) {
      return [];
    }

    const days = datesBetween(checkIn, checkOut);

    return (property.room_type ?? []).map((room) => ({
      property_id: propertyId,
      room_type_id: room.id,
      room_type_name: room.name,
      rate_plans: (room.rate_plans ?? []).map((plan) => ({
        ...plan,
        prices: days.map((day) => priceFor(propertyId, room.id, plan, day)),
      })),
    }));
  }

  async suggestion(params: GrsSuggestionParams): Promise<GrsSuggestion[]> {
    const nights = datesBetween(params.checkIn, params.checkOut).length;

    const candidates = PROPERTIES.filter(
      (property) =>
        (params.cityId === null || property.city_id === params.cityId) &&
        (params.propertyId === null || property.id === params.propertyId) &&
        property.star >= params.star,
    );

    const suggestions = await Promise.all(
      candidates.map(async (property) => {
        const rooms = await this.getAvailableRooms(
          property.id,
          params.checkIn,
          params.checkOut,
        );

        return {
          property_id: property.id,
          property_name: property.name,
          star: property.star,
          city_id: property.city_id,
          address: property.address,
          images: property.images,
          rooms: rooms.flatMap((room) =>
            (room.rate_plans ?? [])
              .filter(
                (plan) =>
                  (plan.prices ?? []).length === nights &&
                  (plan.prices ?? []).every(
                    (price) => !price.closed && price.inventory > 0,
                  ) &&
                  plan.sleeps >= params.adultsCount,
              )
              .map((plan) => ({
                room_type_id: room.room_type_id,
                room_type_name: room.room_type_name,
                rate_plan_id: plan.id,
                rate_plan_name: plan.name,
                capacity: plan.sleeps,
                inventory: Math.min(
                  ...(plan.prices ?? []).map((price) => price.inventory),
                ),
                total_price: sum(plan.prices ?? [], 'rack_rate'),
                total_sales_price: sum(plan.prices ?? [], 'grs_rate'),
                meal_type_included: plan.meal_type_included,
              })),
          ),
        };
      }),
    );

    return suggestions.filter((suggestion) => suggestion.rooms.length > 0);
  }

  async reserve(request: GrsReserveRequest): Promise<GrsReserveDetails> {
    const property = await this.getPropertyDetails(request.property_id);
    if (!property) {
      throw new NotFoundException('Property not exists!!');
    }

    const rooms = await this.getAvailableRooms(
      request.property_id,
      request.check_in,
      request.check_out,
    );

    const priced = request.rooms.map((requested) => {
      const room = rooms.find(
        (item) => item.room_type_id === requested.room_type_id,
      );
      const plan = room?.rate_plans?.find(
        (item) => item.id === requested.rate_plan_id,
      );

      if (!room || !plan) {
        throw new NotFoundException('RatePlan not exists!!');
      }

      const prices = plan.prices ?? [];
      return {
        room_type_id: requested.room_type_id,
        rate_plan_id: requested.rate_plan_id,
        count: requested.count,
        adult_count: requested.adult_count,
        guest_first_name: requested.guest_first_name,
        guest_last_name: requested.guest_last_name,
        // جریمهٔ کنسلی ماک: ۳۰٪ نرخ GRS
        total_cancellation_fee: Math.round(sum(prices, 'grs_rate') * 0.3),
        total_modification_fee: 0,
        total_price: sum(prices, 'rack_rate'),
        total_daily_price: sum(prices, 'daily_rate'),
        total_sales_price: sum(prices, 'grs_rate'),
        prices,
      };
    });

    const confirmationCode = String(randomInt(100_000_000, 1_000_000_000));

    // ۷۴۲ عمداً ظرفیت آفلاین دارد تا مسیر pending تست‌پذیر بماند
    const offline = request.property_id === 742;

    const details: GrsReserveDetails = {
      property_id: request.property_id,
      check_in: request.check_in,
      check_out: request.check_out,
      booker_first_name: request.booker_first_name,
      booker_last_name: request.booker_last_name,
      booker_phone: request.booker_phone,
      booker_email: request.booker_email ?? null,
      state: offline ? 'offline' : 'online',
      status: offline ? 'pending' : 'booking',
      confirmation_code: confirmationCode,
      property_confirmation_code: null,
      agency_confirmation_code: request.agency_confirmation_code,
      discount: 0,
      total_price: priced.reduce((total, room) => total + room.total_price, 0),
      total_sales_price: priced.reduce(
        (total, room) => total + room.total_sales_price,
        0,
      ),
      total_daily_price: priced.reduce(
        (total, room) => total + room.total_daily_price,
        0,
      ),
      total_canellation_fee: priced.reduce(
        (total, room) => total + (room.total_cancellation_fee ?? 0),
        0,
      ),
      total_modification_fee: 0,
      description: request.description ?? null,
      create_date: nowStamp(),
      expire_date: offline
        ? null
        : stamp(new Date(Date.now() + HOLD_MINUTES * 60_000)),
      cancel_date: null,
      definite_date: null,
      rooms: priced,
    };

    this.reserves.set(confirmationCode, details);
    return details;
  }

  async book(confirmationCode: string): Promise<GrsReserveDetails> {
    const reserve = this.mustFind(confirmationCode);

    if (reserve.status !== 'booking') {
      throw new NotFoundException('this action not acceptable in this status!!');
    }
    const expiresAt = parseGrsStamp(reserve.expire_date);
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      reserve.status = 'rejected';
      throw new NotFoundException('Reserve Expired');
    }

    reserve.status = 'definite';
    reserve.definite_date = nowStamp();
    reserve.property_confirmation_code = String(randomInt(10_000, 100_000));
    return reserve;
  }

  async reserveDetails(
    confirmationCode: string,
  ): Promise<GrsReserveDetails | null> {
    return this.reserves.get(confirmationCode) ?? null;
  }

  async cancel(confirmationCode: string): Promise<GrsReserveDetails> {
    const reserve = this.mustFind(confirmationCode);

    // رزروی که هنوز پولش گرفته نشده، بی‌جریمه و بی‌درنگ کنسل می‌شود — همان
    // چیزی که داکیومنت می‌گوید: «اگر قبل از پرداخت باشد بلافاصله canceled»
    if (reserve.status === 'booking' || reserve.status === 'pending') {
      reserve.status = 'canceled';
      reserve.cancel_date = nowStamp();
      reserve.total_canellation_fee = 0;
      return reserve;
    }

    reserve.status = 'canceling';
    return reserve;
  }

  async acceptCancel(confirmationCode: string): Promise<GrsReserveDetails> {
    const reserve = this.mustFind(confirmationCode);

    if (reserve.status !== 'canceling') {
      throw new NotFoundException('this action not acceptable in this status!!');
    }

    reserve.status = 'canceled';
    reserve.cancel_date = nowStamp();
    return reserve;
  }

  async rejectCancel(confirmationCode: string): Promise<GrsReserveDetails> {
    const reserve = this.mustFind(confirmationCode);

    if (reserve.status !== 'canceling') {
      throw new NotFoundException('this action not acceptable in this status!!');
    }

    reserve.status = 'cancellation_rejected';
    return reserve;
  }

  private mustFind(confirmationCode: string): GrsReserveDetails {
    const reserve = this.reserves.get(confirmationCode);
    if (!reserve) {
      throw new NotFoundException('Reserve not exists!!');
    }
    return reserve;
  }
}

// ── دادهٔ ثابت ماک ───────────────────────────────────────────────────────────

/**
 * شهرها.
 *
 * «مشهد مقدس» عمداً با همین نام آمده — دقیقاً همان نگارشی که داکیومنت رسمی GRS
 * در نمونهٔ `/v1/cities` نشان می‌دهد. هتل‌یار همان شهر را «مشهد» می‌نویسد، و
 * تطبیقِ شامل‌بودن در `HotelProviderRouter` برای همین وجود دارد. نیشابور هم
 * هست تا دیده شود شهری که به اقامت۲۴ سپرده نشده از فهرست حذف می‌شود.
 */
const CITIES: GrsCity[] = [
  {
    id: 3,
    name: 'مشهد مقدس',
    province_id: 2,
    province_name: 'خراسان رضوی',
    country_id: 1,
    country_name: 'ایران',
  },
  {
    id: 4,
    name: 'نیشابور',
    province_id: 2,
    province_name: 'خراسان رضوی',
    country_id: 1,
    country_name: 'ایران',
  },
];

function image(name: string, hue: number): { name: string; caption: string; room_type_id: null; url: string } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,38%)"/><stop offset="1" stop-color="hsl(${hue},45%,22%)"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><text x="400" y="260" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle">${name}</text></svg>`;
  return {
    name,
    caption: name,
    room_type_id: null,
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
  };
}

function ratePlan(
  id: number,
  name: string,
  meal: GrsRatePlan['meal_type_included'],
  sleeps: number,
): GrsRatePlan {
  return {
    id,
    name,
    meal_type_included: meal,
    food_board_type: meal ? 'limit_options' : null,
    breakfast_rate: 0,
    half_board_rate: 0,
    full_board_rate: 0,
    cancelable: true,
    sleeps,
    facilities: null,
    prices: null,
    countryid: null,
  };
}

const PROPERTIES: GrsPropertyDetails[] = [
  {
    id: 740,
    name: 'هتل قصر طلایی',
    type: 'hotel',
    star: 5,
    grade: 'A',
    province_id: 2,
    city_id: 3,
    latitude: 36.2895,
    longitude: 59.6157,
    address: 'مشهد، بلوار وکیل‌آباد',
    room_count: 180,
    facilities: [
      { id: 1, name: 'استخر', group_id: 1 },
      { id: 2, name: 'اینترنت پرسرعت', group_id: 2 },
      { id: 3, name: 'پارکینگ', group_id: 1 },
    ],
    images: [image('هتل قصر طلایی', 42), image('لابی', 34)],
    description: 'هتلی پنج‌ستاره در نزدیکی حرم مطهر با دسترسی آسان.',
    rules: null,
    services: null,
    promotions: null,
    room_type: [
      {
        id: 12,
        name: 'اتاق دو تخته',
        type: 'double',
        capacity: 2,
        extra_capacity: 1,
        single_bed_count: 0,
        double_bed_count: 1,
        sofa_bed_count: 0,
        out_of_service: false,
        facilities: null,
        description: null,
        // یک نوع اتاق با دو نرخ‌نامه — همان حالتی که شناسهٔ سه‌بخشی برایش هست
        rate_plans: [
          ratePlan(5, 'با صبحانه', 'breakfast', 2),
          ratePlan(6, 'بدون صبحانه', null, 2),
        ],
      },
      {
        id: 13,
        name: 'سوئیت رویال',
        type: 'suite',
        capacity: 4,
        extra_capacity: 1,
        single_bed_count: 0,
        double_bed_count: 2,
        sofa_bed_count: 1,
        out_of_service: false,
        facilities: null,
        description: null,
        rate_plans: [ratePlan(7, 'فول‌برد', 'full_board', 4)],
      },
    ],
  },
  {
    id: 741,
    name: 'هتل آپارتمان رضوان',
    type: 'apartment_hotel',
    star: 3,
    grade: 'B',
    province_id: 2,
    city_id: 3,
    latitude: 36.2872,
    longitude: 59.6151,
    address: 'مشهد، خیابان امام رضا',
    room_count: 60,
    facilities: [{ id: 2, name: 'اینترنت پرسرعت', group_id: 2 }],
    images: [image('هتل آپارتمان رضوان', 150)],
    description: 'هتل آپارتمان اقتصادی با فاصلهٔ کوتاه تا حرم.',
    rules: null,
    services: null,
    promotions: null,
    room_type: [
      {
        id: 20,
        name: 'آپارتمان یک‌خوابه',
        type: 'apartment',
        capacity: 3,
        extra_capacity: 1,
        single_bed_count: 1,
        double_bed_count: 1,
        sofa_bed_count: 0,
        out_of_service: false,
        facilities: null,
        description: null,
        rate_plans: [ratePlan(9, 'بدون صبحانه', null, 3)],
      },
    ],
  },
  {
    id: 742,
    name: 'مهمانسرای آفتاب',
    type: 'inn',
    star: 2,
    grade: 'C',
    province_id: 2,
    city_id: 3,
    latitude: 36.2801,
    longitude: 59.6099,
    address: 'مشهد، خیابان طبرسی',
    room_count: 25,
    facilities: null,
    images: [image('مهمانسرای آفتاب', 210)],
    description: 'اقامتگاه اقتصادی — ظرفیت آفلاین، تأیید با تأخیر.',
    rules: null,
    services: null,
    promotions: null,
    room_type: [
      {
        id: 30,
        name: 'اتاق سه تخته',
        type: 'triple',
        capacity: 3,
        extra_capacity: 0,
        single_bed_count: 3,
        double_bed_count: 0,
        sofa_bed_count: 0,
        out_of_service: false,
        facilities: null,
        description: null,
        rate_plans: [ratePlan(11, 'با صبحانه', 'breakfast', 3)],
      },
    ],
  },
];

/** نرخ پایهٔ هر نرخ‌نامه به **ریال** برای یک شب */
const BASE_RATES: Record<number, number> = {
  5: 4_500_000,
  6: 3_900_000,
  7: 9_800_000,
  9: 2_600_000,
  11: 1_800_000,
};

function priceFor(
  propertyId: number,
  roomTypeId: number,
  plan: GrsRatePlan,
  day: string,
): GrsRatePlanPrice {
  const grs = BASE_RATES[plan.id] ?? 3_000_000;

  // اتاق ۲۰ عمداً پنجشنبه‌ها بسته است تا منطق «یک شب بسته ⇒ کل بازه ناموجود»
  // در مپر تست‌پذیر بماند
  const closed =
    roomTypeId === 20 && new Date(`${day}T00:00:00Z`).getUTCDay() === 4;

  return {
    day,
    inventory: closed ? 0 : roomTypeId === 13 ? 2 : 6,
    rack_rate: Math.round(grs * 1.25),
    daily_rate: grs,
    grs_rate: grs,
    min_stay: 1,
    max_stay: 30,
    close_to_arrival: false,
    close_to_departure: false,
    closed,
  };
}

function sum(prices: GrsRatePlanPrice[], key: keyof GrsRatePlanPrice): number {
  return prices.reduce((total, price) => total + Number(price[key] ?? 0), 0);
}

/** روزهای اقامت — شب آخر (تاریخ خروج) حساب نمی‌شود */
function datesBetween(checkIn: string, checkOut: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);

  while (cursor.getTime() < end && days.length < 60) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function nowStamp(): string {
  return formatGrsStamp(new Date());
}

const stamp = formatGrsStamp;
