import { IsInt, IsPositive, IsString, Matches } from 'class-validator';

/** شروع پرداخت فروشگاهی — تقسیم بین کیف‌پول‌ها و کارت در UPG انجام می‌شود */
export class StartPaymentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,16}$/, { message: 'کد فروشگاه نامعتبر است' })
  storeCode!: string;

  /** مبلغ کل به تومان — عدد صحیح مثبت */
  @IsInt({ message: 'مبلغ باید عدد صحیح باشد' })
  @IsPositive({ message: 'مبلغ باید بیشتر از صفر باشد' })
  amount!: number;
}
