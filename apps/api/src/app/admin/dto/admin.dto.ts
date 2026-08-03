import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const WALLET_KINDS = ['CREDIT', 'RATION', 'TOURISM'] as const;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'] as const;

export class AdminLoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class ChangeAdminPasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class CreateAdminDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,32}$/, {
    message: 'نام کاربری فقط حروف و اعداد انگلیسی',
  })
  username!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: (typeof ADMIN_ROLES)[number];
}

export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: (typeof ADMIN_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

/** پارامترهای مشترک فهرست‌ها */
export class ListQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  /** 'true' | 'false' — فیلتر وضعیت فعال */
  @IsOptional()
  @IsIn(['true', 'false'])
  active?: string;
}

export class PaymentQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class BookingQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(['CONFIRMED', 'PENDING', 'REJECTED', 'CANCELED'])
  status?: string;
}

export class CreateEmployeeDto {
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @IsString()
  @IsNotEmpty()
  personnelCode!: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/)
  nationalCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  personnelCode?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateStoreDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,12}$/, { message: 'کد فروشگاه: حروف بزرگ و رقم' })
  code?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,32}$/)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,12}$/)
  code?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]{3,32}$/)
  username?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateWalletDefinitionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(WALLET_KINDS)
  kind!: (typeof WALLET_KINDS)[number];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultCap?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storeIds?: string[];
}

export class UpdateWalletDefinitionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsIn(WALLET_KINDS)
  kind?: (typeof WALLET_KINDS)[number];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  defaultCap?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  storeIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAllocationDto {
  @IsString()
  @IsNotEmpty()
  definitionId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  cap!: number;

  @IsDateString()
  expiresAt!: string;
}

export class UpdateAllocationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cap?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class BulkAllocateDto {
  @IsString()
  @IsNotEmpty()
  definitionId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  cap!: number;

  @IsDateString()
  expiresAt!: string;
}

export class AdjustAllocationDto {
  /** مبلغ مثبت = افزایش مانده (برگشت)، منفی = کسر دستی */
  @Type(() => Number)
  @IsInt()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  note!: string;
}
