import { Component, DestroyRef, inject, signal } from '@angular/core';
import { StorePasswordOtpChallenge } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSpinnerImports } from '@sanpay/ui/spinner';
import { StoreAuthService } from '../../core/store-auth.service';

type Field = 'currentPassword' | 'newPassword' | 'repeatPassword' | 'code';

/**
 * تغییر رمز پنل. بار اول با رمزی که مدیریت داده؛ پس از آن فقط با کد پیامکی
 * به موبایل ثبت‌شدهٔ فروشگاه. حالت را `profile.passwordChanged` تعیین می‌کند.
 */
@Component({
  selector: 'store-account',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
  ],
  templateUrl: './account.html',
})
export class AccountPage {
  private readonly auth = inject(StoreAuthService);

  protected readonly store = this.auth.profile;
  protected readonly currentPassword = signal('');
  protected readonly newPassword = signal('');
  protected readonly repeatPassword = signal('');
  protected readonly code = signal('');
  protected readonly challenge = signal<StorePasswordOtpChallenge | null>(null);
  protected readonly resendIn = signal(0);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly saved = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // پروفایل ذخیره‌شده ممکن است از پیش از تغییر رمز در دستگاه دیگر باشد
    void this.auth.ensureSession();
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  protected set(field: Field, value: string): void {
    this[field].set(
      field === 'code'
        ? value
            .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
            .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
            .replace(/\D/g, '')
        : value,
    );
    this.error.set(null);
    this.saved.set(false);
  }

  protected async changeWithPassword(): Promise<void> {
    if (!this.currentPassword()) {
      this.error.set('رمز فعلی را وارد کنید');
      return;
    }
    if (!this.validNewPassword()) return;
    await this.run(async () => {
      await this.auth.changePassword(
        this.currentPassword(),
        this.newPassword(),
      );
      this.done();
    });
  }

  protected async sendCode(): Promise<void> {
    await this.run(async () => {
      const challenge = await this.auth.requestPasswordOtp();
      this.challenge.set(challenge);
      this.code.set('');
      this.startTimer(challenge.retryAfterSeconds);
    });
  }

  protected async changeWithOtp(): Promise<void> {
    if (!/^\d{6}$/.test(this.code())) {
      this.error.set('کد شش‌رقمی پیامک‌شده را کامل وارد کنید');
      return;
    }
    if (!this.validNewPassword()) return;
    await this.run(async () => {
      await this.auth.changePasswordWithOtp(this.code(), this.newPassword());
      this.done();
    });
  }

  protected cancelOtp(): void {
    this.stopTimer();
    this.challenge.set(null);
    this.code.set('');
    this.error.set(null);
  }

  private validNewPassword(): boolean {
    if (this.newPassword().length < 8) {
      this.error.set('رمز جدید باید حداقل ۸ کاراکتر باشد');
      return false;
    }
    if (this.newPassword() !== this.repeatPassword()) {
      this.error.set('رمز جدید و تکرار آن یکسان نیستند');
      return false;
    }
    return true;
  }

  private done(): void {
    this.cancelOtp();
    this.currentPassword.set('');
    this.newPassword.set('');
    this.repeatPassword.set('');
    this.saved.set(true);
  }

  private startTimer(seconds: number): void {
    this.stopTimer();
    this.resendIn.set(seconds);
    this.timer = setInterval(() => {
      const left = this.resendIn() - 1;
      this.resendIn.set(Math.max(0, left));
      if (left <= 0) this.stopTimer();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      await action();
    } catch (caught) {
      // خطای class-validator آرایه است
      const value = (caught as { error?: { message?: unknown } })?.error
        ?.message;
      const message = Array.isArray(value) ? value[0] : value;
      this.error.set(
        typeof message === 'string' ? message : 'انجام عملیات ممکن نشد',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
