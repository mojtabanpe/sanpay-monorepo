import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class UpdateProfileDto {
  /** شمارهٔ موبایل ایران — رشتهٔ خالی یعنی حذف شماره */
  @IsOptional()
  @IsString()
  @Matches(/^(09\d{9})?$/, { message: 'شمارهٔ موبایل نامعتبر است' })
  phone?: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'رمز عبور جدید باید حداقل ۸ کاراکتر باشد' })
  newPassword!: string;
}
