import { HotelSummary, RoomOffer } from './tourism.model';

/**
 * فیلتر و مرتب‌سازی فهرست هتل — منطق خالص و مشترک. سرور صفحه‌بندی را با همین
 * انجام می‌دهد (`POST /api/tourism/hotels/page`) تا اسلایدر قیمت و تعداد هر نوع
 * از کل نتیجه حساب شود، نه از همان ۲۰ کارتی که به اپ رسیده.
 */

/** بازهٔ قیمت [کمینه، بیشینه] به تومان؛ null یعنی بدون فیلتر */
export type PriceRange = readonly [number, number] | null;

/** کارت فهرست — کاتالوگ، یا جست‌وجوی تاریخ‌دار با اتاق‌ها و کمترین قیمت */
export type HotelCard = HotelSummary & {
  /** فقط در جست‌وجوی تاریخ‌دار؛ کاتالوگ «همهٔ شهرها» اتاق و قیمت ندارد */
  rooms?: RoomOffer[];
  fromPrice?: number;
};

export type HotelSort = 'cheap' | 'expensive' | 'stars';

export interface HotelFilters {
  /** نوع اقامتگاه (هتل، هتل‌آپارتمان، …) — خالی یعنی همه */
  types: string[];
  /** ستاره‌ها — خالی یعنی همه */
  rates: number[];
  /** قیمت کل اقامت (تومان) */
  price: PriceRange;
  breakfast: boolean;
  /** حداقل ظرفیت اتاق؛ ۰ یعنی مهم نیست */
  minCapacity: number;
  /** فقط اتاق‌هایی که قیمتشان کمتر از نرخ رسمی هتل است */
  discountOnly: boolean;
  sort: HotelSort;
}

export const NO_HOTEL_FILTERS: HotelFilters = {
  types: [],
  rates: [],
  price: null,
  breakfast: false,
  minCapacity: 0,
  discountOnly: false,
  sort: 'cheap',
};

/** تعداد فیلترهای فعال — مرتب‌سازی فیلتر نیست */
export function activeHotelFilters(filters: HotelFilters): number {
  return (
    (filters.types.length ? 1 : 0) +
    (filters.rates.length ? 1 : 0) +
    (filters.price ? 1 : 0) +
    (filters.breakfast ? 1 : 0) +
    (filters.minCapacity ? 1 : 0) +
    (filters.discountOnly ? 1 : 0)
  );
}

/**
 * فیلترهای سطح اتاق (قیمت، صبحانه، ظرفیت، تخفیف) روی **یک اتاق** با هم
 * سنجیده می‌شوند، نه جدا روی هتل: هتلی که یک اتاق ارزان بی‌صبحانه و یک اتاق
 * گران با صبحانه دارد، برای «صبحانه + زیر X» نباید بیاید. قیمت «از …» کارت هم
 * از ارزان‌ترین اتاقِ مطابق حساب می‌شود، تا با آنچه کاربر فیلتر کرده بخواند.
 */
export function applyHotelFilters(
  hotels: HotelCard[],
  filters: HotelFilters,
): HotelCard[] {
  const types = new Set(filters.types.map(typeKey));
  const rates = new Set(filters.rates);
  const roomMatches = (room: RoomOffer): boolean =>
    (!filters.price ||
      (room.price >= filters.price[0] && room.price <= filters.price[1])) &&
    (!filters.breakfast || room.breakfast) &&
    room.capacity >= filters.minCapacity &&
    (!filters.discountOnly || room.rackRate > room.price);

  const result: HotelCard[] = [];
  for (const hotel of hotels) {
    if (types.size && !types.has(typeKey(hotel.type))) continue;
    if (rates.size && !rates.has(hotel.rate)) continue;
    if (!hotel.rooms) {
      result.push(hotel);
      continue;
    }
    const rooms = hotel.rooms.filter(roomMatches);
    if (rooms.length === 0) continue;
    result.push({
      ...hotel,
      fromPrice: Math.min(...rooms.map((room) => room.price)),
    });
  }

  const byPrice = (a: HotelCard, b: HotelCard) =>
    (a.fromPrice ?? 0) - (b.fromPrice ?? 0);
  switch (filters.sort) {
    case 'cheap':
      // کاتالوگ قیمت ندارد؛ ترتیب خودِ سرور می‌ماند
      return result[0]?.rooms ? result.sort(byPrice) : result;
    case 'expensive':
      return result.sort((a, b) => byPrice(b, a));
    case 'stars':
      return result.sort((a, b) => b.rate - a.rate || byPrice(a, b));
  }
}

/**
 * کلید یکسانِ نوع اقامتگاه. دو تأمین‌کننده یک نوع را با نیم‌فاصله و فاصله
 * می‌نویسند («بوم‌گردی» / «بوم گردی») و بدون این دو گزینهٔ جدا می‌شدند.
 */
export function typeKey(type: string): string {
  return type.replace(/[\u200c\s]+/g, ' ').trim();
}

/** گزینه‌های «نوع اقامتگاه» از خودِ نتیجه‌ها، با تعداد — پرتعدادترین اول */
export function hotelTypeOptions(
  hotels: HotelCard[],
  selected: string[],
): { type: string; count: number }[] {
  // کلید → [برچسب نمایشی، تعداد]؛ برچسب نیم‌فاصله‌دار (املای درست) ترجیح دارد
  const options = new Map<string, { type: string; count: number }>();
  const add = (type: string, count: number) => {
    const key = typeKey(type);
    const option = options.get(key) ?? { type, count: 0 };
    if (type.includes('\u200c')) option.type = type;
    option.count += count;
    options.set(key, option);
  };
  for (const hotel of hotels) if (hotel.type) add(hotel.type, 1);
  // نوعِ انتخاب‌شده‌ای که در نتیجهٔ تازه نیست هم بماند تا بشود برداشتش
  for (const type of selected) if (!options.has(typeKey(type))) add(type, 0);
  return [...options.values()].sort((a, b) => b.count - a.count);
}

/** کمینه و بیشینهٔ قیمت اتاق‌ها، برای لبه‌های اسلایدر */
export function hotelPriceBounds(
  hotels: HotelCard[],
): readonly [number, number] | null {
  const prices = hotels.flatMap((hotel) =>
    (hotel.rooms ?? []).map((room) => room.price),
  );
  if (prices.length === 0) return null;
  return [Math.min(...prices), Math.max(...prices)];
}

/** بیشترین ظرفیت اتاق در نتیجه‌ها — سقف شمارندهٔ ظرفیت */
export function hotelMaxCapacity(hotels: HotelCard[]): number {
  return Math.max(
    0,
    ...hotels.flatMap((hotel) => (hotel.rooms ?? []).map((room) => room.capacity)),
  );
}

/** درخواست یک صفحه از فهرست هتل */
export interface HotelPageRequest {
  /** شناسهٔ مبهم شهر؛ ندادن = کاتالوگ بی‌قیمت «همهٔ شهرها» */
  cityId?: string;
  /** YYYY-MM-DD — فقط با شهر معنا دارد */
  checkin: string;
  nights: number;
  /** تعداد نفرات هر اتاق */
  capacity: number;
  filters: HotelFilters;
  /** از ۱ */
  page: number;
  pageSize: number;
}

/** گزینه‌های فیلتر، از **کل** نتیجه (نه فقط این صفحه) */
export interface HotelFacets {
  types: { type: string; count: number }[];
  priceBounds: readonly [number, number] | null;
  maxCapacity: number;
}

export interface HotelPage {
  /** کارت‌ها بدون فهرست اتاق — فقط «از …» (`fromPrice`) */
  items: HotelCard[];
  /** تعداد بعد از فیلتر */
  total: number;
  /** تعداد کل نتیجهٔ جست‌وجو، پیش از فیلتر */
  unfilteredTotal: number;
  page: number;
  pageSize: number;
  facets: HotelFacets;
}
