import { Type } from 'class-transformer';
import {
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

  /** ۰ یعنی همهٔ هتل‌های شهر */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  hotelId = 0;

  /** ‎-۱ یعنی همهٔ شهرها */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId = -1;

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
}

export class CreateBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hotelId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomId!: number;

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
