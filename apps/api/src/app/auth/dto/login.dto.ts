import { IsString, Length, Matches, MinLength } from 'class-validator';

export class LoginDto {
  /** کد ملی — ده رقم */
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @IsString()
  @Length(6, 72, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  password!: string;
}

export class RequestOtpDto {
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل معتبر نیست' })
  phone!: string;
}

export class VerifyOtpDto extends RequestOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد یک‌بارمصرف باید ۶ رقم باشد' })
  code!: string;
}

export class SetInitialPasswordDto {
  @IsString()
  @MinLength(8, { message: 'رمز عبور باید حداقل ۸ کاراکتر باشد' })
  password!: string;
}
