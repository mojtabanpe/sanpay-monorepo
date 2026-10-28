import { IsUUID, IsString, Matches, MinLength } from 'class-validator';

export class RequestPhoneChangeDto {
  @IsString()
  @Matches(/^09\d{9}$/, {
    message: 'شمارهٔ موبایل جدید باید ۱۱ رقم و با ۰۹ شروع شود',
  })
  phone!: string;
}

export class UpdateProfileDto extends RequestPhoneChangeDto {
  @IsUUID()
  requestId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد تأیید باید ۶ رقم باشد' })
  code!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد' })
  newPassword!: string;
}
