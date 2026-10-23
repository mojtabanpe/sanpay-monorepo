import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../admin/dto/admin.dto';

const PAYMENT_STATUSES = [
  'CREATED',
  'REDIRECTED',
  'VERIFIED',
  'FAILED',
  'EXPIRED',
  'UNKNOWN',
] as const;

export class GatewayPaymentQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  status?: (typeof PAYMENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  gateway?: string;

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

/** تصمیم دستی روی پرداخت (`verified`/`failed`) یا بازگشت (`succeeded`/`failed`) */
export class UpgReviewDto {
  @IsIn(['verified', 'failed', 'succeeded'])
  outcome!: 'verified' | 'failed' | 'succeeded';

  /** یادداشت حسابرسی — چه چیزی دیده شد و تصمیم بر چه پایه‌ای است */
  @IsString()
  @MinLength(5, { message: 'یادداشت بررسی دست‌کم ۵ نویسه باشد' })
  @MaxLength(1000)
  note!: string;
}
