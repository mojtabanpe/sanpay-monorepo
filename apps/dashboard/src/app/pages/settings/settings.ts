import { Component, inject, signal } from '@angular/core';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { ADMIN_ROLE_LABELS, jalaliTime } from '../../core/format';

/** حساب کاربری مدیر: مشخصات و تغییر رمز */
@Component({
  selector: 'app-settings',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
  ],
  templateUrl: './settings.html',
})
export class SettingsPage {
  private readonly auth = inject(AdminAuthService);

  protected readonly profile = this.auth.profile;
  protected readonly roleLabels = ADMIN_ROLE_LABELS;
  protected readonly jalaliTime = jalaliTime;

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly repeat = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    this.error.set(null);
    this.notice.set(null);

    if (this.next().length < 8) {
      this.error.set('رمز جدید باید حداقل ۸ نویسه باشد');
      return;
    }
    if (this.next() !== this.repeat()) {
      this.error.set('تکرار رمز جدید یکی نیست');
      return;
    }

    this.saving.set(true);
    try {
      await this.auth.changePassword(this.current(), this.next());
      this.current.set('');
      this.next.set('');
      this.repeat.set('');
      this.notice.set('رمز عبور تغییر کرد.');
    } catch (caught) {
      this.error.set(apiError(caught, 'تغییر رمز ممکن نشد'));
    } finally {
      this.saving.set(false);
    }
  }
}
