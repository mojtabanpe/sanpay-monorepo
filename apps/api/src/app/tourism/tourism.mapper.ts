import {
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  NearPlace,
  RoomOffer,
  TourismCity,
} from '@sanpay/models';
import {
  GdsCity,
  GdsHotel,
  GdsSearchResult,
} from './gds/gds.types';

/**
 * تبدیل خروجی خام GDS به مدل‌های اپ.
 *
 * GDS تقریباً همهٔ عددها را رشته برمی‌گرداند و بعضی فیلدها (hotelGeo، photo)
 * می‌توانند null باشند؛ نرمال‌سازی همین‌جا انجام می‌شود تا کلاینت با یک شکل
 * ثابت کار کند.
 */

export function toCity(city: GdsCity): TourismCity {
  return { id: Number(city.id), name: city.description };
}

export function toHotelSummary(
  hotel: GdsHotel,
  cityNames: Map<number, string>,
): HotelSummary {
  const cityId = Number(hotel.city);
  return {
    id: Number(hotel.id),
    name: hotel.description,
    rate: Number(hotel.rate) || 0,
    type: hotel.type,
    cityId,
    cityName: cityNames.get(cityId) ?? '',
    address: hotel.address1 ?? '',
    photo: hotel.hotelImage?.[0]?.src ?? null,
  };
}

export function toHotelDetail(
  hotel: GdsHotel,
  cityNames: Map<number, string>,
  gallery: string[],
): HotelDetail {
  return {
    ...toHotelSummary(hotel, cityNames),
    description: (hotel.hotelDescription ?? '').replace(/\r\n/g, '\n').trim(),
    checkInTimeFrom: hotel.checkInTimeFrom ?? '',
    checkOutTimeFrom: hotel.checkOutTimeFrom ?? '',
    // امکانات با "0"/"1" می‌آیند — فقط آن‌هایی که واقعاً هستند به true تبدیل می‌شوند
    facilities: Object.fromEntries(
      Object.entries(hotel.facilities ?? {}).map(([key, value]) => [
        key,
        value === '1',
      ]),
    ),
    nearPlaces: (hotel.nearPlaces ?? []).map(
      (place): NearPlace => ({
        title: place.title,
        distance: place.distance,
      }),
    ),
    images: gallery.length > 0
      ? gallery
      : (hotel.hotelImage ?? []).map((image) => image.src),
    geo: hotel.hotelGeo
      ? { lat: Number(hotel.hotelGeo.lat), lng: Number(hotel.hotelGeo.lng) }
      : null,
  };
}

export function toAvailability(result: GdsSearchResult): HotelAvailability {
  return {
    hotelId: result.hotelId,
    hotelName: result.hotelName,
    checkin: result.checkin,
    checkout: result.checkout,
    nights: nightsBetween(result.checkin, result.checkout),
    rooms: (result.room ?? [])
      .map(
        (room): RoomOffer => ({
          roomId: room.roomId,
          roomType: room.roomType || room.description || roomTypeName(room.nameCode),
          capacity: Number(room.capacity) || 1,
          breakfast: Number(room.breakfast) === 1,
          extraBed: Number(room.extraBed) || 0,
          // realFreeCapacity وقتی هتل پکیج تعریف کرده باشد معتبرتر است
          freeCapacity: Number(room.realFreeCapacity ?? room.freeCapacity) || 0,
          price: room.price,
          rackRate: room.rackRate,
        }),
      )
      // اتاق پر یا بدون قیمت به کارمند نشان داده نمی‌شود
      .filter((room) => room.freeCapacity > 0 && room.price > 0),
  };
}

/** nameCode اتاق (۱ تا ۷) طبق داکیومنت GDS v6.3 */
const ROOM_TYPE_NAMES: Record<string, string> = {
  '1': 'اتاق یک تخته',
  '2': 'اتاق دو تخته',
  '3': 'اتاق سه تخته',
  '4': 'اتاق',
  '5': 'سوئیت',
  '6': 'آپارتمان',
  '7': 'ویلا',
};

function roomTypeName(nameCode: string): string {
  return ROOM_TYPE_NAMES[nameCode] ?? 'اتاق';
}

export function nightsBetween(checkin: string, checkout: string): number {
  const from = Date.parse(`${checkin}T00:00:00Z`);
  const to = Date.parse(`${checkout}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / 86_400_000));
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
