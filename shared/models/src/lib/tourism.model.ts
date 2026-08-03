/**
 * مدل‌های گردشگری — نمای ساده‌شدهٔ خروجی هتل‌یار/WorldGDS که به اپ کارمند
 * می‌رسد. جزئیات خام GDS (policy، halfDay، package و …) در بک‌اند می‌ماند و
 * فقط چیزی که در UI نمایش داده می‌شود اینجا مدل شده است.
 */

/** یک شهر قابل انتخاب در جست‌وجوی هتل */
export interface TourismCity {
  id: number;
  name: string;
}

/** هتل در فهرست — بدون قیمت و ظرفیت */
export interface HotelSummary {
  id: number;
  name: string;
  /** تعداد ستاره (۰ تا ۵) */
  rate: number;
  /** نوع اقامتگاه: هتل، هتل‌آپارتمان، … */
  type: string;
  cityId: number;
  cityName: string;
  address: string;
  /** تصویر شاخص */
  photo: string | null;
}

/** امکانات هتل — کلید اسلاگ انگلیسی، مقدار true/false */
export type HotelFacilities = Record<string, boolean>;

/** مکان دیدنی یا مهم نزدیک هتل */
export interface NearPlace {
  title: string;
  /** فاصله به‌صورت متن آمادهٔ نمایش («۱۴ دقیقه با ماشین») */
  distance: string;
}

export interface HotelDetail extends HotelSummary {
  description: string;
  checkInTimeFrom: string;
  checkOutTimeFrom: string;
  facilities: HotelFacilities;
  nearPlaces: NearPlace[];
  /** گالری تصاویر */
  images: string[];
  geo: { lat: number; lng: number } | null;
}

/** یک اتاق قابل رزرو در بازهٔ تاریخ جست‌وجو شده */
export interface RoomOffer {
  roomId: number;
  /** نام نوع اتاق («اتاق یک تخته») */
  roomType: string;
  /** ظرفیت نفرات */
  capacity: number;
  /** صبحانه دارد؟ */
  breakfast: boolean;
  /** تعداد تخت اضافه قابل درخواست */
  extraBed: number;
  /** تعداد اتاق خالی */
  freeCapacity: number;
  /** قیمت کل اقامت برای این اتاق (تومان) */
  price: number;
  /** قیمت بورد هتل — برای نمایش تخفیف (تومان) */
  rackRate: number;
}

/** نتیجهٔ جست‌وجوی اتاق‌های یک هتل برای تاریخ مشخص */
export interface HotelAvailability {
  hotelId: number;
  hotelName: string;
  /** ISO date (YYYY-MM-DD) */
  checkin: string;
  checkout: string;
  nights: number;
  rooms: RoomOffer[];
}

/** کیف پول گردشگریِ قابل استفاده برای رزرو */
export interface TourismWallet {
  allocationId: string;
  name: string;
  icon: string | null;
  /** حداکثر مبلغ قابل برداشت (تومان) */
  max: number;
  expiresAt: string;
}

/** پیش‌فاکتور رزرو: قیمت + کیف‌پول‌های قابل استفاده */
export interface BookingQuote {
  hotelId: number;
  hotelName: string;
  room: RoomOffer;
  checkin: string;
  checkout: string;
  nights: number;
  /** مبلغ قابل پرداخت (تومان) */
  amount: number;
  wallets: TourismWallet[];
  totalAvailable: number;
}

export interface BookingGuest {
  firstName: string;
  lastName: string;
  /** کد ملی */
  nationalCode: string;
  mobile: string;
}

export interface CreateBookingInput {
  hotelId: number;
  roomId: number;
  /** ISO date (YYYY-MM-DD) */
  checkin: string;
  nights: number;
  guest: BookingGuest;
  /** کیف پول گردشگری که مبلغ از آن کم می‌شود */
  allocationId: string;
}

/**
 * وضعیت رزرو.
 * `CONFIRMED` = ظرفیت آنلاین قطعی (statusCode 1 در GDS)،
 * `PENDING` = ظرفیت آفلاین، هتل‌یار بعداً تأیید می‌کند (statusCode 0).
 */
export type BookingStatus = 'CONFIRMED' | 'PENDING' | 'REJECTED' | 'CANCELED';

/** رسید رزرو — چیزی که بعد از پرداخت به کارمند نشان داده می‌شود */
export interface BookingReceipt {
  id: string;
  /** شمارهٔ پیگیری داخلی سان‌پی (۸ رقمی) */
  referenceNo: string;
  status: BookingStatus;
  hotelName: string;
  roomType: string;
  checkin: string;
  checkout: string;
  nights: number;
  guestName: string;
  /** مبلغ کسرشده (تومان) */
  amount: number;
  walletName: string;
  /** ماندهٔ کیف پول بعد از رزرو (تومان) */
  remainingAfter: number;
  /** توضیح هتل‌یار برای رزرو ردشده یا کنسل‌شده (از webhook) */
  statusNote?: string | null;
  /** مبلغ برگشت‌خورده به کیف پول بابت رد یا کنسلی (تومان) */
  refundedAmount?: number | null;
  createdAt: string;
}
