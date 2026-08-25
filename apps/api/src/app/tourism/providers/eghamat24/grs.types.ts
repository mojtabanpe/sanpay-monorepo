/**
 * تایپ‌های خام API اقامت۲۴ / GRS (GRS Agency API Document v1.18.4).
 *
 * تفاوت‌های مهمش با هتل‌یار که در تایپ‌ها و کلاینت منعکس شده:
 *
 * - احراز هویت با هدر ثابت `Client-Token` است؛ نه login، نه session، نه انقضا.
 * - REST واقعی است: GET برای خواندن، POST برای نوشتن، و HTTP status معنادار
 *   (۴۰۳ توکن بد، ۴۲۲ خطای اعتبارسنجی).
 * - **ولی خطای موجودی با HTTP 200 برمی‌گردد** و فقط در `errors[]` دیده می‌شود
 *   (نمونهٔ صفحهٔ ۶ داکیومنت: `code: 200` با `errors: [{name: "inventory"}]`).
 *   پس مثل هتل‌یار باز هم چک‌کردن status code کافی نیست.
 * - قیمت‌ها **ریال**‌اند (نمونهٔ داکیومنت: `total_price: 90000000`)، در حالی که
 *   کل سان‌پی با تومان کار می‌کند. تبدیل در مپر انجام می‌شود.
 */

/** پوشش ثابت همهٔ پاسخ‌ها */
export interface GrsEnvelope<T> {
  code: number;
  message: string;
  /** داکیومنت هر دو املا را نشان می‌دهد؛ هر کدام که آمد خوانده می‌شود */
  errors?: GrsError[] | null;
  error?: GrsError[] | null;
  value: T | null;
}

export interface GrsError {
  name: string;
  message: string;
}

export interface GrsCity {
  id: number;
  name: string;
  province_id: number;
  province_name: string;
  country_id: number;
  country_name: string;
}

export interface GrsFacility {
  id: number;
  name: string;
  group_id: number;
  description?: string;
}

export interface GrsFile {
  name: string;
  caption: string;
  room_type_id: string | null;
  url: string;
}

export interface GrsRule {
  id?: number;
  title?: string;
  description?: string;
}

export interface GrsProperty {
  id: number;
  name: string;
  /** hotel | apartment_hotel | motel | … (بخش Property Type داکیومنت) */
  type: string;
  star: number;
  grade: string;
  province_id: number;
  city_id: number;
  latitude: number | null;
  longitude: number | null;
  address: string;
  room_count: number;
  facilities: GrsFacility[] | null;
  images: GrsFile[] | null;
  description: string | null;
  rules: GrsRule[] | null;
}

export interface GrsPropertyDetails extends GrsProperty {
  room_type: GrsRoomType[] | null;
  services: GrsPropertyService[] | null;
  promotions: unknown[] | null;
}

export interface GrsPropertyService {
  type: string;
  name?: string;
  price?: number;
}

export interface GrsRoomType {
  id: number;
  name: string;
  type: string;
  capacity: number;
  extra_capacity: number;
  single_bed_count: number;
  double_bed_count: number;
  sofa_bed_count: number;
  out_of_service: boolean;
  facilities: GrsFacility[] | null;
  rate_plans: GrsRatePlan[] | null;
  description: string | null;
}

export interface GrsRatePlan {
  id: number;
  name: string;
  meal_type_included: 'breakfast' | 'half_board' | 'full_board' | null;
  food_board_type: 'limit_options' | 'full_options' | null;
  breakfast_rate: number;
  half_board_rate: number;
  full_board_rate: number;
  cancelable: boolean;
  sleeps: number;
  /** حداقل/حداکثر شب — در RatePlan Details داکیومنت */
  min_stay?: number;
  max_stay?: number;
  facilities: GrsFacility[] | null;
  prices: GrsRatePlanPrice[] | null;
  countryid?: number | null;
}

export interface GrsRatePlanPrice {
  /** YYYY-MM-DD */
  day: string;
  inventory: number;
  /** نرخ برد هتل */
  rack_rate: number;
  daily_rate: number;
  /** نرخ GRS — همان که ما می‌پردازیم */
  grs_rate: number;
  baby_cot_racke_rate?: number;
  baby_cot_daily_rate?: number;
  baby_cot_grs_rate?: number;
  extend_bed_rack_rate?: number;
  extend_bed_daily_rate?: number;
  extend_bed_grs_rate?: number;
  reservation_state?: string;
  min_stay: number;
  max_stay: number;
  close_to_arrival: boolean;
  close_to_departure: boolean;
  /** true یعنی بسته */
  closed: boolean;
}

/** خروجی available-rooms */
export interface GrsRoomRate {
  property_id: number;
  room_type_id: number;
  room_type_name: string;
  rate_plans: GrsRatePlan[] | null;
}

/**
 * خروجی suggestion (جست‌وجوی شهری).
 *
 * ⚠ شکل دقیق این موجودیت در نسخه‌ای از داکیومنت که داریم بازنشده است (صفحهٔ ۶۰
 * فقط عنوان دارد). این تایپ از روی خروجی available-rooms و پارامترهای
 * suggestion حدس زده شده. **قبل از اتصال به سرویس واقعی باید با یک پاسخ واقعی
 * تطبیق داده شود** — تا آن موقع فقط ماک از آن استفاده می‌کند.
 */
export interface GrsSuggestion {
  property_id: number;
  property_name?: string;
  star?: number;
  city_id?: number;
  address?: string;
  images?: GrsFile[] | null;
  rooms: GrsSuggestionRoom[] | null;
}

export interface GrsSuggestionRoom {
  room_type_id: number;
  room_type_name: string;
  rate_plan_id: number;
  rate_plan_name?: string;
  capacity: number;
  extra_capacity?: number;
  inventory: number;
  total_price: number;
  total_sales_price: number;
  meal_type_included?: string | null;
}

// ── رزرو ─────────────────────────────────────────────────────────────────────

export interface GrsReserveRoom {
  room_type_id: number;
  rate_plan_id: number;
  /** طبق داکیومنت فعلاً باید ۱ باشد */
  count: number;
  adult_count: number;
  children: number[];
  guest_first_name: string;
  guest_last_name: string;
  guest_phone: string;
  guest_email: string;
  guest_national_code: string;
  guest_passport_number: string;
  guest_country_id: number | null;
  guest_city_id: number | null;
}

export interface GrsReserveRequest {
  property_id: number;
  /** YYYY-MM-DD */
  check_in: string;
  check_out: string;
  booker_first_name: string;
  booker_last_name: string;
  booker_phone: string;
  booker_email?: string | null;
  /** کد پیگیری خودمان — برای تطبیق webhook */
  agency_confirmation_code: string;
  description?: string | null;
  rooms: GrsReserveRoom[];
}

/** وضعیت‌های رزرو در GRS (بخش ReserveDetailsStatus داکیومنت) */
export type GrsReserveStatus =
  | 'pending'
  | 'booking'
  | 'booked'
  | 'definite'
  | 'rejected'
  | 'suggested'
  | 'modify_booking'
  | 'rejected_modify'
  | 'modifying'
  | 'modified'
  | 'overbooking'
  | 'refund'
  | 'canceling'
  | 'canceled'
  | 'cancellation_rejected';

export interface GrsReserveDetails {
  property_id: number;
  check_in: string;
  check_out: string;
  booker_first_name: string;
  booker_last_name: string;
  booker_phone: string;
  booker_email?: string | null;
  /** online | offline */
  state: string;
  status: GrsReserveStatus;
  /** کد پیگیری GRS — همان چیزی که در book/cancel پس می‌فرستیم */
  confirmation_code: string;
  property_confirmation_code: string | null;
  agency_confirmation_code: string | null;
  discount: number;
  /** نرخ برد کل */
  total_price: number;
  /** نرخ GRS کل — مبلغی که ما بدهکاریم */
  total_sales_price: number;
  total_daily_price: number;
  total_canellation_fee?: number | null;
  total_modification_fee?: number | null;
  description: string | null;
  create_date: string;
  /** مهلت نهایی‌سازی رزروِ booking */
  expire_date: string | null;
  cancel_date: string | null;
  definite_date: string | null;
  rooms: GrsReserveRoomDetails[] | null;
}

export interface GrsReserveRoomDetails {
  room_type_id: number;
  rate_plan_id: number;
  count: number;
  adult_count: number;
  guest_first_name: string;
  guest_last_name: string;
  total_cancellation_fee?: number | null;
  total_modification_fee?: number | null;
  total_price: number;
  total_daily_price: number;
  total_sales_price: number;
  prices: GrsRatePlanPrice[] | null;
}

/** بدنهٔ رویداد webhook — بخش GRS Agency Web Hook داکیومنت */
export interface GrsWebhookPayload {
  /** reserve_changed | available_changed | property_changed | reserve_activity */
  method: string;
  value: unknown;
}

/**
 * قرارداد کلاینت اقامت۲۴. پیاده‌سازی واقعی و ماک هر دو همین را دارند تا
 * `Eghamat24Provider` از منبع داده بی‌خبر بماند.
 */
export abstract class GrsClient {
  abstract getCities(): Promise<GrsCity[]>;
  abstract getProperties(cityId: number | null): Promise<GrsProperty[]>;
  abstract getPropertyDetails(
    propertyId: number,
  ): Promise<GrsPropertyDetails | null>;
  abstract getAvailableRooms(
    propertyId: number,
    checkIn: string,
    checkOut: string,
  ): Promise<GrsRoomRate[]>;
  abstract suggestion(params: GrsSuggestionParams): Promise<GrsSuggestion[]>;
  abstract reserve(request: GrsReserveRequest): Promise<GrsReserveDetails>;
  abstract book(confirmationCode: string): Promise<GrsReserveDetails>;
  abstract reserveDetails(
    confirmationCode: string,
  ): Promise<GrsReserveDetails | null>;
  abstract cancel(confirmationCode: string): Promise<GrsReserveDetails>;
  abstract acceptCancel(confirmationCode: string): Promise<GrsReserveDetails>;
  abstract rejectCancel(confirmationCode: string): Promise<GrsReserveDetails>;
}

export interface GrsSuggestionParams {
  cityId: number | null;
  propertyId: number | null;
  /** YYYY-MM-DD */
  checkIn: string;
  checkOut: string;
  adultsCount: number;
  /** حداقل ستاره؛ ۰ یعنی بدون فیلتر */
  star: number;
}
