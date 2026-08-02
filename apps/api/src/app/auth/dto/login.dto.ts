import { IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  /** کد ملی — ده رقم */
  @IsString()
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @IsString()
  @Length(6, 72, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  password!: string;
}
