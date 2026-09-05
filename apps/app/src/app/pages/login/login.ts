import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@sanpay/applets/auth';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { HlmSeparatorImports } from '@sanpay/ui/separator';

type LoginMode = 'password' | 'otp';
type OtpStep = 'identity' | 'code' | 'setPassword';

function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

@Component({
  selector: 'app-login',
  imports: [
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSeparatorImports,
  ],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly mode = signal<LoginMode>('password');
  protected readonly otpStep = signal<OtpStep>('identity');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly otpNationalCode = signal('');
  protected readonly otpPhone = signal('');

  protected setMode(mode: LoginMode): void {
    this.mode.set(mode);
    this.error.set(null);
    this.notice.set(null);
  }

  protected async passwordLogin(
    nationalCodeEl: HTMLInputElement,
    passwordEl: HTMLInputElement,
  ): Promise<void> {
    const nationalCode = toEnglishDigits(nationalCodeEl.value.trim());
    if (!/^\d{10}$/.test(nationalCode) || !passwordEl.value || this.loading()) {
      this.error.set('کد ملی و رمز عبور را کامل وارد کنید.');
      return;
    }
    await this.run(async () => {
      await this.auth.login(nationalCode, passwordEl.value);
      await this.router.navigate(['/home']);
    });
  }

  protected async requestOtp(
    nationalCodeEl: HTMLInputElement,
    phoneEl: HTMLInputElement,
  ): Promise<void> {
    const nationalCode = toEnglishDigits(nationalCodeEl.value.trim());
    const phone = toEnglishDigits(phoneEl.value.trim());
    if (!/^\d{10}$/.test(nationalCode) || !/^09\d{9}$/.test(phone)) {
      this.error.set('کد ملی ۱۰ رقمی و شماره موبایل ۱۱ رقمی معتبر وارد کنید.');
      return;
    }
    await this.run(async () => {
      try {
        const response = await this.auth.requestOtp(nationalCode, phone);
        this.showOtpCodeStep(
          nationalCode,
          phone,
          response.message ??
            'اگر اطلاعات شما ثبت شده باشد، کد ورود پیامک شده است.',
        );
      } catch (caught) {
        if (caught instanceof HttpErrorResponse && caught.status === 429) {
          this.showOtpCodeStep(nationalCode, phone, this.apiError(caught));
          return;
        }
        throw caught;
      }
    });
  }

  protected async verifyOtp(codeEl: HTMLInputElement): Promise<void> {
    const code = toEnglishDigits(codeEl.value.trim());
    if (!/^\d{6}$/.test(code)) {
      this.error.set('کد ۶ رقمی پیامک‌شده را وارد کنید.');
      return;
    }
    await this.run(async () => {
      const response = await this.auth.verifyOtp(
        this.otpNationalCode(),
        this.otpPhone(),
        code,
      );
      if (response.requiresPasswordSetup) {
        this.otpStep.set('setPassword');
        this.notice.set('برای ورودهای بعدی یک رمز عبور تعیین کنید.');
      } else {
        await this.router.navigate(['/home']);
      }
    });
  }

  protected async setInitialPassword(
    passwordEl: HTMLInputElement,
    confirmEl: HTMLInputElement,
  ): Promise<void> {
    if (passwordEl.value.length < 8) {
      this.error.set('رمز عبور باید حداقل ۸ کاراکتر باشد.');
      return;
    }
    if (passwordEl.value !== confirmEl.value) {
      this.error.set('تکرار رمز عبور با رمز انتخابی یکسان نیست.');
      return;
    }
    await this.run(async () => {
      await this.auth.setInitialPassword(passwordEl.value);
      await this.router.navigate(['/home']);
    });
  }

  protected editIdentity(): void {
    this.otpStep.set('identity');
    this.notice.set(null);
    this.error.set(null);
  }

  private showOtpCodeStep(
    nationalCode: string,
    phone: string,
    notice: string,
  ): void {
    this.otpNationalCode.set(nationalCode);
    this.otpPhone.set(phone);
    this.otpStep.set('code');
    this.notice.set(notice);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (caught) {
      this.error.set(this.apiError(caught));
    } finally {
      this.loading.set(false);
    }
  }

  private apiError(caught: unknown): string {
    if (caught instanceof HttpErrorResponse) {
      const message = caught.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') {
        return message[0];
      }
    }
    return 'ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.';
  }
}
