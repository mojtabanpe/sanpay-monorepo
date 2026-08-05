/**
 * تایپ‌های خام API هتل‌یار / WorldGDS (GDS Document v6.3).
 *
 * نکته‌های مهم دربارهٔ این API که در تایپ‌ها منعکس شده:
 * - بیشتر فیلدهای عددی به‌صورت **رشته** برمی‌گردند (`"rate": "5"`)، حتی وقتی
 *   در ورودی عدد می‌خواهد. هرجا ممکن بود `string | number` گرفته‌ایم و در
 *   مپر نرمال‌سازی می‌کنیم.
 * - همهٔ متدها POST هستند و `sessionId` در **بدنه** می‌رود، نه هدر.
 * - پاسخ همیشه در پوشش `{status, errorCode, description, response, datetime}`
 *   است و خطا هم با HTTP 200 برمی‌گردد؛ پس باید `status` را چک کرد.
 */

export interface GdsEnvelope<T> {
  status: boolean;
  errorCode: number;
  description: string;
  response: T;
  datetime: string;
}

export interface GdsLoginResponse {
  sessionId: string;
  refreshToken: string;
  /** "YYYY-MM-DD HH:mm:ss" */
  expiredTime?: string;
}

export interface GdsCity {
  id: string;
  description: string;
  province: string;
}

export interface GdsHotelRoom {
  id: number | string;
  nameCode: string;
  description: string;
  roomSize: string;
  capacity: string;
  extraBed: string;
  totalNo: string;
}

export interface GdsNearPlace {
  id: string;
  title: string;
  distance: string;
}

export interface GdsHotel {
  id: string;
  description: string;
  charCode: string;
  checkInTimeFrom: string;
  checkOutTimeFrom: string;
  typeCode: string;
  type: string;
  rate: string;
  city: string;
  province: string;
  address1: string;
  room: GdsHotelRoom[];
  hotelDescription: string;
  nearPlaces: GdsNearPlace[];
  /** مقادیر "0"/"1" */
  facilities: Record<string, string>;
  /**
   * گالری هتل — داخل خودِ getHotel می‌آید، نه از getHotelImages.
   * دسته‌بندی دارد (نمای کلی، لابی، اتاق…) و هر عکس دو اندازه.
   */
  images: GdsHotelImageEntry[] | null;
  hotelGeo: { lat: string; lng: string } | null;
}

export interface GdsHotelImageEntry {
  category: string;
  categoryName: string;
  images: { original: string; thumb: string } | null;
}

export interface GdsHotelImage {
  url: string;
  title: string;
}

export interface GdsSearchRoom {
  roomId: number;
  extraBed: string;
  breakfast: number;
  nameCode: string;
  roomType?: string;
  description?: string;
  capacity: string;
  rackRate: number;
  price: number;
  commission: number;
  freeCapacity: number | string;
  realFreeCapacity?: number | string;
  detailPrice: {
    date: string;
    rackRate: number;
    price: number;
    commission: number;
  }[];
}

export interface GdsSearchResult {
  checkin: string;
  checkout: string;
  hotelId: number;
  hotelName: string;
  rate: string;
  type: string;
  address: string;
  photo: string | null;
  /** 1 = قیمت علی‌الحساب، 0 = قطعی */
  partPayment?: number;
  room: GdsSearchRoom[];
}

export interface GdsBookPassenger {
  roomId: string;
  name: string;
  family: string;
  /** "0" ورود عادی، "1" ورود زودهنگام */
  early: string;
  /** "0" خروج عادی، "1" خروج دیرهنگام */
  late: string;
  description: string;
  mobile: string | null;
  /** کد ملی */
  idNo: string;
  /** سن نفرات اضافه */
  extraPerson: number[];
}

export interface GdsBookRequest {
  firstname: string;
  lastname: string;
  email: string;
  tel: string;
  mobile: string;
  hotelId: number;
  /** شمارهٔ پیگیری یکتای ما — برای استعلام بعدی با report */
  externalId: string;
  checkin: string;
  night: number;
  isForeigner: 0 | 1;
  passenger: GdsBookPassenger[];
}

export interface GdsBookResponse {
  /** "Booked" (قطعی) یا "Pending" (آفلاین) */
  reserveStatus: string;
  /** "1" قطعی، "0" در انتظار */
  statusCode: string;
  message: string;
  paidByHotelCredit: string | number;
  reserve: {
    info: {
      id: string;
      thirdPartyCode: string | null;
      externalId: string;
      isPartPayment: number;
      hotelId: string;
    };
    passenger: {
      rank: number;
      name: string;
      family: string;
      roomId: string;
      checkin: string;
      night: string;
      dayPrice: {
        date: string;
        price: number;
        rackRate: number;
        /** مبلغی که ما باید به هتل بدهیم — مبنای تسویه */
        hotelPrice: number;
      }[];
    }[];
  };
}

// ─── webhook (بخش ۱۴ داکیومنت) ────────────────────────────────────────────────

/**
 * رویدادی که هتل‌یار به آدرس اعلام‌شدهٔ ما POST می‌کند.
 *
 * سه اکشن دارد:
 * - `reserve` — رزرو آفلاینِ Pending نهایی و تأیید شد.
 * - `reserve_reject` — هتل ظرفیت نداشت یا رزرو برگشت خورد (`detail.message`).
 * - `change` — تغییر بعد از قطعی‌شدن رزرو؛ کنسلی هم از همین راه می‌آید و در
 *   `report.changesLog[].detail.changes[].operation === 1` دیده می‌شود.
 *
 * فقط فیلدهایی که واقعاً استفاده می‌کنیم تایپ شده‌اند؛ بقیهٔ بدنه خام در
 * `GdsWebhookEvent.payload` بایگانی می‌شود.
 */
export interface GdsWebhookEventPayload {
  action: string;
  detail: {
    reservationId: string | number;
    changeId?: string | number;
    message?: string;
    report?: GdsReserveReport;
  };
  dateTime?: string;
}

/** خروجی متد report — همان چیزی که در بدنهٔ webhook هم تکرار می‌شود */
export interface GdsReserveReport {
  reservationId: number | string;
  externalId?: string;
  hotelId?: number | string;
  hotelName?: string;
  /** وضعیت رزرو در هتل‌یار — رشته یا عدد می‌آید */
  status?: string | number;
  currentReserve?: {
    detail?: { price?: GdsReportPrice };
  };
  changesLog?: {
    changeId?: number | string;
    operationDate?: string;
    detail?: {
      price?: GdsReportPrice;
      changes?: {
        /** ۱ = کنسل */
        operation: number | string;
        operationName?: string;
        passenger?: string;
      }[];
    };
  }[];
}

export interface GdsReportPrice {
  totalCustomerPrice?: number;
  totalAgencyCommission?: number;
  totalHotelPrice?: number;
  totalCustomerPenalty?: number;
  /** مبلغی که باید به مشتری (اینجا: کیف پول کارمند) برگردد */
  totalReturnToCustomer?: number;
}

/** ورودی جست‌وجو — پارامترهای مشترکی که ما همیشه می‌فرستیم */
export interface GdsSearchParams {
  checkin: string;
  nights: number;
  hotelId: number;
  cityId: number;
  rate: number;
  capacityId: number;
  capacity: number;
  person: number;
  lang: number;
  isForeigner: 0 | 1;
  detail: 0 | 1;
}

/**
 * قرارداد کلاینت هتل‌یار. پیاده‌سازی واقعی (`GdsHttpClient`) و ماک
 * (`GdsMockClient`) هر دو همین را پیاده می‌کنند تا سرویس گردشگری از منبع داده
 * بی‌خبر بماند.
 */
export abstract class GdsClient {
  abstract getCities(): Promise<GdsCity[]>;
  abstract getHotels(cityId: number): Promise<GdsHotel[]>;
  abstract getHotel(hotelId: number): Promise<GdsHotel | null>;
  abstract getHotelImages(hotelId: number): Promise<GdsHotelImage[]>;
  abstract searchHotel(params: GdsSearchParams): Promise<GdsSearchResult[]>;
  abstract book(request: GdsBookRequest): Promise<GdsBookResponse>;
}
