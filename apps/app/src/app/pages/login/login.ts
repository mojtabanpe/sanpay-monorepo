import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { HlmSeparatorImports } from '@sanpay/ui/separator';
import { AuthService } from '@sanpay/applets/auth';

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند تا کد ملی همیشه یکدست ذخیره شود */
function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
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

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async onSubmit(
    nationalCodeEl: HTMLInputElement,
    passwordEl: HTMLInputElement,
  ): Promise<void> {
    const nationalCode = toEnglishDigits(nationalCodeEl.value.trim());
    const password = passwordEl.value;
    if (!nationalCode || !password || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.login(nationalCode, password);
      this.router.navigate(['/home']);
    } catch (e) {
      if (e instanceof HttpErrorResponse && (e.status === 401 || e.status === 400)) {
        this.error.set('کد ملی یا رمز عبور نادرست است.');
      } else {
        this.error.set('ارتباط با سرور برقرار نشد؛ دوباره تلاش کنید.');
      }
    } finally {
      this.loading.set(false);
    }
  }
}
