import { IsString, Length, Matches } from 'class-validator';

const NEW_PASSWORD_LENGTH = 'رمز جدید باید بین ۸ تا ۷۲ کاراکتر باشد';

export class StoreChangePasswordDto {
  @IsString()
  currentPassword!: string;

  // bcrypt فقط ۷۲ بایت اول را می‌خواند
  @IsString()
  @Length(8, 72, { message: NEW_PASSWORD_LENGTH })
  newPassword!: string;
}

export class StoreChangePasswordWithOtpDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد تأیید باید ۶ رقم باشد' })
  code!: string;

  @IsString()
  @Length(8, 72, { message: NEW_PASSWORD_LENGTH })
  newPassword!: string;
}
