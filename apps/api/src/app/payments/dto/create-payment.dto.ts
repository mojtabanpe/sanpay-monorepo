import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

export class PaymentLineDto {
  @IsUUID()
  allocationId!: string;

  /** مبلغ به تومان — عدد صحیح مثبت */
  @IsInt({ message: 'مبلغ باید عدد صحیح باشد' })
  @IsPositive({ message: 'مبلغ باید بیشتر از صفر باشد' })
  amount!: number;
}

export class CreatePaymentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,16}$/, { message: 'کد فروشگاه نامعتبر است' })
  storeCode!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'حداقل یک کیف پول باید انتخاب شود' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  lines!: PaymentLineDto[];
}
