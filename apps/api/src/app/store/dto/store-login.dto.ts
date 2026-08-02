import { IsString, Length, Matches } from 'class-validator';

export class StoreLoginDto {
  @IsString()
  @Matches(/^[a-z0-9_-]{3,32}$/, { message: 'نام کاربری نامعتبر است' })
  username!: string;

  @IsString()
  @Length(6, 72, { message: 'رمز عبور باید حداقل ۶ کاراکتر باشد' })
  password!: string;
}
