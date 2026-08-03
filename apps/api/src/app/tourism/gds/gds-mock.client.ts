import { Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  GdsBookRequest,
  GdsBookResponse,
  GdsCity,
  GdsClient,
  GdsHotel,
  GdsHotelImage,
  GdsSearchParams,
  GdsSearchResult,
} from './gds.types';

/**
 * ماک هتل‌یار برای توسعه بدون کلید واقعی (`GDS_MODE=mock`).
 *
 * عمداً همان شکل خام GDS را برمی‌گرداند — رشته‌بودن عددها، ظرفیت صفر برای
 * بعضی اتاق‌ها، رزرو Pending برای هتل آفلاین — تا وقتی کلید واقعی آمد
 * مپرها و مسیرهای خطا از قبل تست شده باشند.
 */
@Injectable()
export class GdsMockClient extends GdsClient {
  private readonly logger = new Logger(GdsMockClient.name);

  constructor() {
    super();
    this.logger.warn('کلاینت هتل‌یار در حالت ماک است — هیچ رزرو واقعی ثبت نمی‌شود');
  }

  async getCities(): Promise<GdsCity[]> {
    return CITIES;
  }

  async getHotels(cityId: number): Promise<GdsHotel[]> {
    return cityId === -1
      ? HOTELS
      : HOTELS.filter((hotel) => Number(hotel.city) === cityId);
  }

  async getHotel(hotelId: number): Promise<GdsHotel | null> {
    return HOTELS.find((hotel) => Number(hotel.id) === hotelId) ?? null;
  }

  async getHotelImages(hotelId: number): Promise<GdsHotelImage[]> {
    const hotel = await this.getHotel(hotelId);
    return (hotel?.hotelImage ?? []).map((image, index) => ({
      url: image.src,
      title: `${hotel?.description ?? ''} ${index + 1}`,
    }));
  }

  async searchHotel(params: GdsSearchParams): Promise<GdsSearchResult[]> {
    const checkout = addDays(params.checkin, params.nights);
    const dates = Array.from({ length: params.nights }, (_, index) =>
      addDays(params.checkin, index),
    );

    return HOTELS.filter((hotel) => {
      if (params.hotelId > 0) return Number(hotel.id) === params.hotelId;
      if (params.cityId > 0) return Number(hotel.city) === params.cityId;
      return true;
    })
      .filter((hotel) => params.rate === 0 || Number(hotel.rate) >= params.rate)
      .map((hotel) => ({
        checkin: params.checkin,
        checkout,
        hotelId: Number(hotel.id),
        hotelName: hotel.description,
        rate: hotel.rate,
        type: hotel.type,
        address: hotel.address1,
        photo: hotel.hotelImage[0]?.src ?? null,
        partPayment: 0,
        room: hotel.room
          .filter((room) => Number(room.capacity) >= params.capacity)
          .map((room) => {
            const nightly = nightlyRate(Number(hotel.id), Number(room.id));
            const price = nightly * params.nights;
            // هتل ۳۶۲ عمداً یک اتاق پرشده دارد تا حالت «ظرفیت تکمیل» تست شود
            const freeCapacity =
              Number(hotel.id) === 362 && Number(room.id) === 9802
                ? 0
                : 2 + (Number(room.id) % 4);
            return {
              roomId: Number(room.id),
              extraBed: room.extraBed,
              breakfast: Number(hotel.facilities['restaurant'] ?? '0'),
              nameCode: room.nameCode,
              roomType: room.description,
              capacity: room.capacity,
              rackRate: Math.round(price * 1.15),
              price,
              commission: 0,
              freeCapacity,
              realFreeCapacity: freeCapacity,
              detailPrice: dates.map((date) => ({
                date,
                rackRate: Math.round(nightly * 1.15),
                price: nightly,
                commission: 0,
              })),
            };
          }),
      }));
  }

  async book(request: GdsBookRequest): Promise<GdsBookResponse> {
    const hotel = await this.getHotel(request.hotelId);
    if (!hotel) {
      throw new Error('هتل پیدا نشد');
    }

    const passenger = request.passenger[0];
    const nightly = nightlyRate(request.hotelId, Number(passenger.roomId));
    const dates = Array.from({ length: request.night }, (_, index) =>
      addDays(request.checkin, index),
    );

    // هتل ۳۶۲ ظرفیت آفلاین دارد → رزرو در انتظار تأیید می‌ماند
    const offline = request.hotelId === 362;

    return {
      reserveStatus: offline ? 'Pending' : 'Booked',
      statusCode: offline ? '0' : '1',
      message: offline
        ? 'This reserve is offline we will contact you soon'
        : 'Success',
      paidByHotelCredit: -1,
      reserve: {
        info: {
          id: String(randomInt(10_000, 99_999)),
          thirdPartyCode: null,
          externalId: request.externalId,
          isPartPayment: 0,
          hotelId: String(request.hotelId),
        },
        passenger: [
          {
            rank: 1,
            name: passenger.name,
            family: passenger.family,
            roomId: passenger.roomId,
            checkin: request.checkin,
            night: String(request.night),
            dayPrice: dates.map((date) => ({
              date,
              price: nightly,
              rackRate: Math.round(nightly * 1.15),
              // آنچه ما شبانه به هتل‌یار تسویه می‌کنیم: قیمت منهای ۱۰٪ کمیسیون
              hotelPrice: Math.round(nightly * 0.9),
            })),
          },
        ],
      },
    };
  }
}

/**
 * تصویر جایگزین به‌صورت data URI.
 *
 * عمداً به هیچ CDN خارجی وصل نمی‌شویم: تصاویر بیرونی در ایران قابل اتکا
 * نیستند و ماک باید بدون اینترنت هم درست کار کند (همان دلیلی که فونت
 * Vazirmatn هم self-host شده است).
 */
function placeholder(label: string, from: string, to: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
</linearGradient></defs>
<rect width="800" height="500" fill="url(#g)"/>
<g fill="none" stroke="#ffffff" stroke-opacity="0.65" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
<path d="M250 340h300M290 340V210l110-70 110 70v130M360 340v-70h80v70"/>
</g>
<text x="400" y="425" fill="#ffffff" fill-opacity="0.9" font-size="34" font-family="sans-serif" text-anchor="middle">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** قیمت شبانهٔ پایدار (تومان) — بین فراخوانی‌ها تغییر نمی‌کند تا UI پرش نکند */
function nightlyRate(hotelId: number, roomId: number): number {
  return 1_500_000 + ((hotelId * 31 + roomId * 17) % 20) * 250_000;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const CITIES: GdsCity[] = [
  { id: '1', description: 'تهران', province: '1' },
  { id: '2', description: 'مشهد', province: '2' },
  { id: '3', description: 'اصفهان', province: '3' },
  { id: '4', description: 'شیراز', province: '4' },
  { id: '5', description: 'کیش', province: '5' },
  { id: '6', description: 'کرمان', province: '6' },
];

const FACILITIES_FULL = {
  tv: '1',
  pool: '1',
  suit: '1',
  restaurant: '1',
  internet: '1',
  parking: '1',
  prayRoom: '1',
  sport: '1',
  cafe: '1',
  telInRoom: '1',
  sona: '1',
  refrigerator: '1',
  labi: '1',
  shop: '1',
};

const FACILITIES_BASIC = {
  tv: '1',
  pool: '0',
  suit: '0',
  restaurant: '1',
  internet: '1',
  parking: '1',
  prayRoom: '1',
  sport: '0',
  cafe: '0',
  telInRoom: '1',
  sona: '0',
  refrigerator: '1',
  labi: '1',
  shop: '0',
};

const HOTELS: GdsHotel[] = [
  {
    id: '339',
    description: 'هتل پارسیان استقلال تهران',
    charCode: 'IRTHES',
    checkInTimeFrom: '14:00',
    checkOutTimeFrom: '12:00',
    typeCode: '1',
    type: 'هتل',
    rate: '5',
    city: '1',
    province: '1',
    address1: 'تهران، تقاطع بزرگراه چمران و خیابان ولی‌عصر',
    room: [
      {
        id: 1339,
        nameCode: '1',
        description: 'اتاق یک تخته',
        roomSize: '25',
        capacity: '1',
        extraBed: '0',
        totalNo: '120',
      },
      {
        id: 1340,
        nameCode: '2',
        description: 'اتاق دو تخته',
        roomSize: '32',
        capacity: '2',
        extraBed: '1',
        totalNo: '180',
      },
      {
        id: 1341,
        nameCode: '5',
        description: 'سوئیت رویال',
        roomSize: '70',
        capacity: '4',
        extraBed: '2',
        totalNo: '20',
      },
    ],
    hotelDescription:
      'هتل پنج ستارهٔ پارسیان استقلال، با دو برج شرقی و غربی، یکی از بزرگ‌ترین هتل‌های بین‌المللی تهران است و در شمال شهر، نزدیک بزرگراه چمران قرار دارد.',
    nearPlaces: [
      { id: '295', title: 'نمایشگاه بین‌المللی تهران', distance: '۱۴ دقیقه با ماشین (۸.۴ کیلومتر)' },
      { id: '296', title: 'فرودگاه امام خمینی', distance: '۱ ساعت و ۲ دقیقه با ماشین (۷۵.۷ کیلومتر)' },
      { id: '297', title: 'برج میلاد', distance: '۲۰ دقیقه با ماشین (۱۱ کیلومتر)' },
    ],
    facilities: FACILITIES_FULL,
    hotelImage: [
      { src: placeholder('استقلال تهران — نمای بیرونی', '#6d28d9', '#4c1d95'), alt: '' },
      { src: placeholder('استقلال تهران — لابی', '#7c3aed', '#5b21b6'), alt: '' },
      { src: placeholder('استقلال تهران — اتاق', '#8b5cf6', '#6d28d9'), alt: '' },
    ],
    hotelGeo: { lat: '35.792954', lng: '51.355962' },
  },
  {
    id: '360',
    description: 'هتل قصر طلایی مشهد',
    charCode: 'IRMHDQ',
    checkInTimeFrom: '14:00',
    checkOutTimeFrom: '12:00',
    typeCode: '1',
    type: 'هتل',
    rate: '5',
    city: '2',
    province: '2',
    address1: 'مشهد، بلوار وکیل‌آباد، نبش صدف',
    room: [
      {
        id: 1460,
        nameCode: '2',
        description: 'اتاق دو تخته',
        roomSize: '30',
        capacity: '2',
        extraBed: '1',
        totalNo: '90',
      },
      {
        id: 1461,
        nameCode: '3',
        description: 'اتاق سه تخته',
        roomSize: '40',
        capacity: '3',
        extraBed: '1',
        totalNo: '60',
      },
    ],
    hotelDescription:
      'هتل قصر طلایی مشهد از لوکس‌ترین هتل‌های شهر با دسترسی آسان به حرم مطهر و مجموعه‌ای کامل از امکانات رفاهی و تفریحی است.',
    nearPlaces: [
      { id: '401', title: 'حرم مطهر رضوی', distance: '۱۵ دقیقه با ماشین (۷ کیلومتر)' },
      { id: '402', title: 'فرودگاه شهید هاشمی‌نژاد', distance: '۲۵ دقیقه با ماشین (۱۴ کیلومتر)' },
    ],
    facilities: FACILITIES_FULL,
    hotelImage: [
      { src: placeholder('قصر طلایی مشهد — نما', '#b45309', '#78350f'), alt: '' },
      { src: placeholder('قصر طلایی مشهد — لابی', '#d97706', '#92400e'), alt: '' },
    ],
    hotelGeo: { lat: '36.316', lng: '59.529' },
  },
  {
    id: '361',
    description: 'هتل عباسی اصفهان',
    charCode: 'IRISFA',
    checkInTimeFrom: '14:00',
    checkOutTimeFrom: '12:00',
    typeCode: '1',
    type: 'هتل',
    rate: '5',
    city: '3',
    province: '3',
    address1: 'اصفهان، خیابان شهید مدرس، چهارباغ عباسی',
    room: [
      {
        id: 979,
        nameCode: '2',
        description: 'اتاق دو تخته سنتی',
        roomSize: '28',
        capacity: '2',
        extraBed: '1',
        totalNo: '70',
      },
      {
        id: 981,
        nameCode: '4',
        description: 'اتاق رو به باغ',
        roomSize: '34',
        capacity: '2',
        extraBed: '1',
        totalNo: '45',
      },
    ],
    hotelDescription:
      'هتل عباسی، کاروانسرای دوران صفوی، قدیمی‌ترین هتل ایران و از زیباترین بناهای تاریخی اصفهان با باغ مرکزی چشم‌نواز است.',
    nearPlaces: [
      { id: '501', title: 'میدان نقش جهان', distance: '۸ دقیقه پیاده (۶۰۰ متر)' },
      { id: '502', title: 'سی‌وسه پل', distance: '۱۲ دقیقه پیاده (۹۰۰ متر)' },
    ],
    facilities: FACILITIES_FULL,
    hotelImage: [
      { src: placeholder('هتل عباسی — باغ مرکزی', '#047857', '#064e3b'), alt: '' },
      { src: placeholder('هتل عباسی — اتاق سنتی', '#059669', '#065f46'), alt: '' },
    ],
    hotelGeo: { lat: '32.652', lng: '51.669' },
  },
  {
    id: '362',
    description: 'هتل‌آپارتمان جهان کیش',
    charCode: 'IRKIHJ',
    checkInTimeFrom: '15:00',
    checkOutTimeFrom: '12:00',
    typeCode: '2',
    type: 'هتل‌آپارتمان',
    rate: '4',
    city: '5',
    province: '5',
    address1: 'کیش، میدان امیرکبیر، بلوار ساحل',
    room: [
      {
        id: 9801,
        nameCode: '6',
        description: 'آپارتمان یک‌خوابه',
        roomSize: '55',
        capacity: '3',
        extraBed: '1',
        totalNo: '40',
      },
      {
        id: 9802,
        nameCode: '6',
        description: 'آپارتمان دوخوابه رو به دریا',
        roomSize: '80',
        capacity: '5',
        extraBed: '2',
        totalNo: '25',
      },
    ],
    hotelDescription:
      'هتل‌آپارتمان جهان کیش با واحدهای مجهز به آشپزخانه، مناسب اقامت خانوادگی و در فاصلهٔ کوتاه از ساحل مرجانی است.',
    nearPlaces: [
      { id: '601', title: 'ساحل مرجان', distance: '۵ دقیقه پیاده (۴۰۰ متر)' },
      { id: '602', title: 'بازار پردیس', distance: '۱۰ دقیقه با ماشین (۵ کیلومتر)' },
    ],
    facilities: FACILITIES_BASIC,
    hotelImage: [
      { src: placeholder('جهان کیش — نمای ساحلی', '#0369a1', '#0c4a6e'), alt: '' },
      { src: placeholder('جهان کیش — آپارتمان', '#0284c7', '#075985'), alt: '' },
    ],
    hotelGeo: { lat: '26.539', lng: '53.980' },
  },
  {
    id: '363',
    description: 'هتل زندیه شیراز',
    charCode: 'IRSYZZ',
    checkInTimeFrom: '14:00',
    checkOutTimeFrom: '12:00',
    typeCode: '1',
    type: 'هتل',
    rate: '5',
    city: '4',
    province: '4',
    address1: 'شیراز، خیابان زند، نبش فلکه ولی‌عصر',
    room: [
      {
        id: 7701,
        nameCode: '1',
        description: 'اتاق یک تخته',
        roomSize: '24',
        capacity: '1',
        extraBed: '0',
        totalNo: '50',
      },
      {
        id: 7702,
        nameCode: '2',
        description: 'اتاق دو تخته',
        roomSize: '30',
        capacity: '2',
        extraBed: '1',
        totalNo: '85',
      },
    ],
    hotelDescription:
      'هتل زندیه در قلب بافت تاریخی شیراز و در نزدیکی ارگ کریم‌خان، ترکیبی از معماری سنتی و امکانات مدرن است.',
    nearPlaces: [
      { id: '701', title: 'ارگ کریم‌خان', distance: '۶ دقیقه پیاده (۵۰۰ متر)' },
      { id: '702', title: 'حافظیه', distance: '۱۰ دقیقه با ماشین (۴ کیلومتر)' },
    ],
    facilities: FACILITIES_FULL,
    hotelImage: [
      { src: placeholder('زندیه شیراز — نما', '#be185d', '#831843'), alt: '' },
      { src: placeholder('زندیه شیراز — حیاط', '#db2777', '#9d174d'), alt: '' },
    ],
    hotelGeo: { lat: '29.616', lng: '52.531' },
  },
];
