import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';

@Component({
  selector: 'profile-change-password',
  imports: [HlmButtonImports, HlmCardImports],
  templateUrl: './change-password.html',
})
export class ChangePasswordPage {
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly confirm = signal('');

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

  protected readonly canSubmit = computed(
    () =>
      !this.busy() &&
      this.current().length > 0 &&
      this.next().length >= 8 &&
      this.next() === this.confirm(),
  );

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      if (this.next().length < 8) {
        this.error.set('رمز عبور جدید باید حداقل ۸ کاراکتر باشد');
      } else if (this.next() !== this.confirm()) {
        this.error.set('تکرار رمز عبور با رمز جدید یکی نیست');
      }
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.profileService.changePassword(this.current(), this.next()),
      );
      this.done.set(true);
      // رمز عوض شد؛ توکن فعلی هنوز معتبر است، فقط به پروفایل برمی‌گردیم
      setTimeout(() => void this.router.navigate(['/profile']), 1500);
    } catch (caught) {
      this.error.set(
        caught instanceof HttpErrorResponse &&
          typeof caught.error?.message === 'string'
          ? caught.error.message
          : 'تغییر رمز عبور ناموفق بود',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
