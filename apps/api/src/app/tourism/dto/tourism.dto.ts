import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** YYYY-MM-DD */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SearchHotelsDto {
  @Matches(ISO_DATE, { message: 'تاریخ ورود باید به شکل YYYY-MM-DD باشد' })
  checkin!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'تعداد شب باید حداقل ۱ باشد' })
  @Max(30, { message: 'حداکثر ۳۰ شب قابل رزرو است' })
  nights!: number;

  /** شناسهٔ مبهم هتل؛ ندادن یعنی همهٔ هتل‌ها */
  @IsOptional()
  @IsString()
  hotelId?: string;

  /** شناسهٔ مبهم شهر؛ ندادن یعنی همهٔ شهرها */
  @IsOptional()
  @IsString()
  cityId?: string;

  /** حداقل تعداد ستاره؛ ۰ یعنی بدون فیلتر */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  rate = 0;

  /** تعداد نفرات هر اتاق */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  capacity = 2;
}

export class HotelFiltersDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  query = '';

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  types: string[] = [];

  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(5, { each: true })
  rates: number[] = [];

  /** [کمینه، بیشینه] به ریال؛ null یعنی بدون فیلتر */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  @Min(0, { each: true })
  price: [number, number] | null = null;

  @IsBoolean()
  breakfast = false;

  @IsInt()
  @Min(0)
  @Max(20)
  minCapacity = 0;

  @IsBoolean()
  discountOnly = false;

  @IsIn(['cheap', 'expensive', 'stars'])
  sort: 'cheap' | 'expensive' | 'stars' = 'cheap';
}

/** یک صفحه از فهرست هتل — فیلترها روی کل نتیجه و سمت سرور */
export class HotelPageDto {
  /** شناسهٔ مبهم شهر؛ ندادن یعنی کاتالوگ «همهٔ شهرها» */
  @IsOptional()
  @IsString()
  cityId?: string;

  @Matches(ISO_DATE, { message: 'تاریخ ورود باید به شکل YYYY-MM-DD باشد' })
  checkin!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'تعداد شب باید حداقل ۱ باشد' })
  @Max(30, { message: 'حداکثر ۳۰ شب قابل رزرو است' })
  nights!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  capacity = 2;

  @ValidateNested()
  @Type(() => HotelFiltersDto)
  filters: HotelFiltersDto = new HotelFiltersDto();

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

/** همان الگوی نام در فرم پرواز */
const LATIN_NAME = /^[A-Za-z][A-Za-z '-]{0,69}$/;

/**
 * نام فارسی مهمان هتل: فقط حروف فارسی، فاصله و نیم‌فاصله — نام انگلیسی
 * جای خودش (`firstNameEn`) را دارد و هرگز در این فیلد ذخیره نمی‌شود.
 */
const PERSIAN_NAME =
  /^(?:(?![\u0660-\u0669\u06F0-\u06F9])[\u0600-\u06FF\u200c ])+$/;

export class BookingGuestDto {
  @IsString()
  @IsNotEmpty({ message: 'نام مسافر لازم است' })
  @Matches(PERSIAN_NAME, { message: 'نام را با حروف فارسی بنویسید' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام خانوادگی مسافر لازم است' })
  @Matches(PERSIAN_NAME, { message: 'نام خانوادگی را با حروف فارسی بنویسید' })
  lastName!: string;

  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @Matches(/^09\d{9}$/, { message: 'شمارهٔ موبایل معتبر نیست' })
  mobile!: string;

  /** فقط برای دفترچهٔ مسافران — به تأمین‌کننده فرستاده نمی‌شود */
  @Matches(ISO_DATE, { message: 'تاریخ تولد باید به شکل YYYY-MM-DD باشد' })
  birthdate!: string;
  /** اختیاری — فقط دفترچهٔ مسافران (برای پرواز)؛ به تأمین‌کنندهٔ هتل نمی‌رود */
  @IsOptional()
  @Matches(LATIN_NAME, {
    message: 'نام انگلیسی را فقط با حروف انگلیسی بنویسید',
  })
  firstNameEn?: string;

  @IsOptional()
  @Matches(LATIN_NAME, {
    message: 'نام خانوادگی انگلیسی را فقط با حروف انگلیسی بنویسید',
  })
  lastNameEn?: string;
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty({ message: 'هتل انتخاب نشده است' })
  hotelId!: string;

  @IsString()
  @IsNotEmpty({ message: 'اتاق انتخاب نشده است' })
  roomId!: string;

  @Matches(ISO_DATE, { message: 'تاریخ ورود باید به شکل YYYY-MM-DD باشد' })
  checkin!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  nights!: number;

  @ValidateNested()
  @Type(() => BookingGuestDto)
  guest!: BookingGuestDto;

  /** منسوخ — تقسیم پرداخت در UPG انجام می‌شود؛ برای سازگاری با کلاینت قدیمی پذیرفته می‌شود */
  @IsOptional()
  @IsUUID(undefined, { message: 'کیف پول انتخاب‌شده معتبر نیست' })
  allocationId?: string;
}

/** افزودن یا ویرایش مسافر در دفترچهٔ مسافران کارمند */
export class SaveTravelerDto {
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @IsOptional()
  @Matches(PERSIAN_NAME, { message: 'نام را با حروف فارسی بنویسید' })
  firstName?: string;

  @IsOptional()
  @Matches(PERSIAN_NAME, { message: 'نام خانوادگی را با حروف فارسی بنویسید' })
  lastName?: string;

  @IsOptional()
  @Matches(LATIN_NAME, {
    message: 'نام انگلیسی را فقط با حروف انگلیسی بنویسید',
  })
  firstNameEn?: string;

  @IsOptional()
  @Matches(LATIN_NAME, {
    message: 'نام خانوادگی انگلیسی را فقط با حروف انگلیسی بنویسید',
  })
  lastNameEn?: string;

  @IsOptional()
  @Matches(/^09\d{9}$/, { message: 'شمارهٔ موبایل معتبر نیست' })
  mobile?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: 'تاریخ تولد باید به شکل YYYY-MM-DD باشد' })
  birthdate?: string;

  @IsOptional()
  @IsIn(['male', 'female'], { message: 'جنسیت معتبر نیست' })
  gender?: 'male' | 'female';

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'کد کشور باید ۲ حرف انگلیسی بزرگ باشد' })
  nationality?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{3,20}$/, { message: 'شماره گذرنامه معتبر نیست' })
  passportNumber?: string;

  @IsOptional()
  @Matches(ISO_DATE, {
    message: 'تاریخ انقضای گذرنامه باید به شکل YYYY-MM-DD باشد',
  })
  passportExpirationDate?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, {
    message: 'کد کشور صادرکننده گذرنامه باید ۲ حرف انگلیسی بزرگ باشد',
  })
  passportIssueCountry?: string;
}
