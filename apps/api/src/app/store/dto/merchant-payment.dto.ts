import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class CreateMerchantPaymentIntentDto {
  @IsString()
  @Matches(/^\d{10}$/)
  nationalCode!: string;

  @IsString()
  @Matches(/^09\d{9}$/)
  phone!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount!: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class VerifyMerchantPaymentIntentDto {
  @IsString()
  intentId!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
