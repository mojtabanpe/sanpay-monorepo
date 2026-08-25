/**
 * تبدیل خروجی خام GRS به مدل‌های اپ.
 *
 * دو نکته که کل این فایل را شکل می‌دهند:
 *
 * ۱. **واحد پول.** GRS ریال می‌دهد، سان‌پی همه‌جا تومان کار می‌کند. تبدیل فقط
 *    همین‌جا انجام می‌شود تا هیچ عدد ریالی به سرویس و دیتابیس نشت نکند.
 *
 * ۲. **شناسهٔ اتاق سه‌بخشی است.** رزرو در GRS هم `room_type_id` می‌خواهد هم
 *    `rate_plan_id`؛ یک نوع اتاق می‌تواند چند نرخ‌نامه داشته باشد (با صبحانه،
 *    بدون صبحانه، …) که از نظر کارمند گزینه‌های جدا هستند. پس هر ترکیبِ
 *    (نوع اتاق × نرخ‌نامه) یک `RoomOffer` جداگانه با شناسهٔ `eg:ملک:نوع:نرخ`
 *    می‌شود.
 */

import {
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  NearPlace,
  RoomOffer,
  TourismCity,
} from '@sanpay/models';
import { encodeId } from '../provider-id';
import {
  GrsCity,
  GrsProperty,
  GrsPropertyDetails,
  GrsRatePlan,
  GrsRoomRate,
  GrsSuggestion,
} from './grs.types';

/** پیشوند شناسه‌های این تأمین‌کننده */
const EG = 'eg' as const;

/** GRS ریال می‌دهد؛ اپ تومان نشان می‌دهد */
export function rialToToman(rial: number): number {
  return Math.round((rial ?? 0) / 10);
}

/** نام فارسی انواع اقامتگاه (بخش Property Type داکیومنت v1.18.4) */
const PROPERTY_TYPE_NAMES: Record<string, string> = {
  hotel: 'هتل',
  apartment_hotel: 'هتل آپارتمان',
  apartment_suite: 'سوئیت',
  residential_complex: 'مجتمع مسکونی',
  beach_residential_complex: 'مجتمع مسکونی ساحلی',
  motel: 'متل',
  inn: 'مسافرخانه',
  privilege_inn: 'مسافرخانه ویژه',
  pension: 'مهمانکده',
  hostel: 'خوابگاه',
  traditional_residence: 'اقامتگاه سنتی',
  ecotourism_resorts: 'اقامتگاه بوم‌گردی',
  residential_unit: 'واحد مسکونی',
  traveler_house: 'خانه مسافر',
};

export function toCity(city: GrsCity): TourismCity {
  return { id: encodeId(EG, city.id), name: city.name };
}

export function toHotelSummary(
  property: GrsProperty,
  cityNames: Map<number, string>,
): HotelSummary {
  return {
    id: encodeId(EG, property.id),
    name: property.name,
    rate: Number(property.star) || 0,
    type: PROPERTY_TYPE_NAMES[property.type] ?? property.type ?? 'اقامتگاه',
    cityId: encodeId(EG, property.city_id),
    cityName: cityNames.get(property.city_id) ?? '',
    address: property.address ?? '',
    photo: photosOf(property)[0] ?? null,
  };
}

function photosOf(property: {
  images?: { url: string }[] | null;
}): string[] {
  return (property.images ?? [])
    .map((image) => image?.url)
    .filter((url): url is string => !!url);
}

export function toHotelDetail(
  property: GrsPropertyDetails,
  cityNames: Map<number, string>,
): HotelDetail {
  return {
    ...toHotelSummary(property, cityNames),
    description: (property.description ?? '').replace(/\r\n/g, '\n').trim(),
    // GRS ساعت ورود/خروج را در Property Details نمی‌دهد — این دو فیلد در
    // داکیومنت v1.18.4 وجود ندارند. خالی می‌مانند تا اپ آن‌ها را نشان ندهد،
    // نه اینکه عددی از خودمان دربیاوریم.
    checkInTimeFrom: '',
    checkOutTimeFrom: '',
    facilities: Object.fromEntries(
      (property.facilities ?? []).map((facility) => [facility.name, true]),
    ),
    // GRS معادل nearPlaces ندارد
    nearPlaces: [] as NearPlace[],
    images: photosOf(property),
    geo:
      property.latitude !== null && property.longitude !== null
        ? { lat: Number(property.latitude), lng: Number(property.longitude) }
        : null,
  };
}

/**
 * تبدیل خروجی available-rooms یک اقامتگاه به مدل موجودی.
 *
 * موجودی و قیمت هر نرخ‌نامه **روزانه** می‌آید، پس قیمت کل اقامت جمع روزهاست و
 * موجودی قابل عرضه کمینهٔ روزهاست: اتاقی که یکی از شب‌ها پر است، برای کل بازه
 * قابل رزرو نیست. جمع‌زدن یا میانگین‌گرفتنِ موجودی همان باگ کلاسیکی است که
 * اتاق ناموجود را در دسترس نشان می‌دهد.
 */
export function toAvailability(
  propertyId: number,
  hotelName: string,
  checkin: string,
  checkout: string,
  nights: number,
  rooms: GrsRoomRate[],
): HotelAvailability {
  return {
    hotelId: encodeId(EG, propertyId),
    hotelName,
    checkin,
    checkout,
    nights,
    rooms: rooms.flatMap((room) =>
      (room.rate_plans ?? [])
        .map((plan) => toRoomOffer(propertyId, room, plan, nights))
        .filter((offer): offer is RoomOffer => offer !== null),
    ),
  };
}

function toRoomOffer(
  propertyId: number,
  room: GrsRoomRate,
  plan: GrsRatePlan,
  nights: number,
): RoomOffer | null {
  const prices = plan.prices ?? [];

  // بازهٔ ناقص یعنی برای بعضی شب‌ها نرخ تعریف نشده — همان خطای `rate` که
  // داکیومنت هنگام رزرو می‌دهد. بهتر است همین‌جا حذف شود تا کارمند اتاقی را
  // انتخاب نکند که رزروش قطعاً رد می‌شود.
  if (prices.length < nights) {
    return null;
  }

  // هر شبِ بسته یا بدون موجودی کل بازه را غیرقابل رزرو می‌کند
  if (prices.some((price) => price.closed || price.inventory <= 0)) {
    return null;
  }

  if (nights < (plan.min_stay ?? 1)) {
    return null;
  }

  const total = prices.reduce((sum, price) => sum + (price.grs_rate ?? 0), 0);
  const rack = prices.reduce((sum, price) => sum + (price.rack_rate ?? 0), 0);

  if (total <= 0) {
    return null;
  }

  return {
    roomId: encodeId(EG, propertyId, room.room_type_id, plan.id),
    roomType: planLabel(room.room_type_name, plan),
    capacity: Number(plan.sleeps) || 1,
    breakfast: plan.meal_type_included !== null,
    extraBed: 0,
    freeCapacity: Math.min(...prices.map((price) => price.inventory)),
    price: rialToToman(total),
    rackRate: rialToToman(rack),
  };
}

/**
 * برچسب اتاق.
 *
 * نام نرخ‌نامه به نام اتاق چسبانده می‌شود چون یک نوع اتاق چند بار در فهرست
 * می‌آید و بدون این تفاوت، کارمند دو ردیف «اتاق دو تخته» با دو قیمت متفاوت
 * می‌بیند و نمی‌فهمد فرقشان چیست.
 */
function planLabel(roomTypeName: string, plan: GrsRatePlan): string {
  const name = roomTypeName || 'اتاق';
  const meal = MEAL_LABELS[plan.meal_type_included ?? ''];

  if (meal) {
    return `${name} — ${meal}`;
  }
  // نام نرخ‌نامه فقط وقتی می‌آید که چیز تازه‌ای بگوید
  return plan.name && plan.name !== name ? `${name} — ${plan.name}` : name;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'با صبحانه',
  half_board: 'هاف‌برد',
  full_board: 'فول‌برد',
};

/**
 * تبدیل خروجی suggestion (جست‌وجوی شهری) به مدل موجودی.
 *
 * ⚠ مثل `GrsSuggestion`، این نگاشت روی پاسخ واقعی تأیید نشده است.
 */
export function suggestionToAvailability(
  suggestion: GrsSuggestion,
  checkin: string,
  checkout: string,
  nights: number,
): HotelAvailability {
  return {
    hotelId: encodeId(EG, suggestion.property_id),
    hotelName: suggestion.property_name ?? '',
    checkin,
    checkout,
    nights,
    rooms: (suggestion.rooms ?? [])
      .filter((room) => room.inventory > 0 && room.total_sales_price > 0)
      .map((room) => ({
        roomId: encodeId(
          EG,
          suggestion.property_id,
          room.room_type_id,
          room.rate_plan_id,
        ),
        roomType: room.rate_plan_name
          ? `${room.room_type_name} — ${room.rate_plan_name}`
          : room.room_type_name,
        capacity: Number(room.capacity) || 1,
        breakfast: !!room.meal_type_included,
        extraBed: Number(room.extra_capacity) || 0,
        freeCapacity: room.inventory,
        price: rialToToman(room.total_sales_price),
        rackRate: rialToToman(room.total_price),
      })),
  };
}
