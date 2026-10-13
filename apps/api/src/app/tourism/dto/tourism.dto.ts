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

  /** [کمینه، بیشینه] به تومان؛ null یعنی بدون فیلتر */
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

export class BookingGuestDto {
  @IsString()
  @IsNotEmpty({ message: 'نام مسافر لازم است' })
  firstName!: string;

  @IsString()
  @IsNotEmpty({ message: 'نام خانوادگی مسافر لازم است' })
  lastName!: string;

  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @Matches(/^09\d{9}$/, { message: 'شمارهٔ موبایل معتبر نیست' })
  mobile!: string;

  /** فقط برای دفترچهٔ مسافران — به تأمین‌کننده فرستاده نمی‌شود */
  @Matches(ISO_DATE, { message: 'تاریخ تولد باید به شکل YYYY-MM-DD باشد' })
  birthdate!: string;
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

  @IsUUID(undefined, { message: 'کیف پول انتخاب‌شده معتبر نیست' })
  allocationId!: string;
}
