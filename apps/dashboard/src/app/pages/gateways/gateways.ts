import { Component, inject, signal } from '@angular/core';
import { AdminRefundWallet, AdminUpgSettings } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmTableImports } from '@sanpay/ui/table';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { fa, toman } from '../../core/format';

/**
 * درگاه‌های پرداخت UPG: موجودی کیف پول بازگشت (با هشدار کمبود) و پیکربندی
 * فعلی. پیکربندی از env خوانده می‌شود و این صفحه فعلاً فقط نمایش است.
 */
@Component({
  selector: 'app-gateways',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmTableImports,
  ],
  templateUrl: './gateways.html',
})
export class GatewaysPage {
  private readonly api = inject(AdminApiService);

  protected readonly toman = toman;
  protected readonly fa = fa;

  protected readonly wallets = signal<AdminRefundWallet[]>([]);
  protected readonly settings = signal<AdminUpgSettings | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [wallets, settings] = await Promise.all([
        this.api.refundWallets(),
        this.api.upgSettings(),
      ]);
      this.wallets.set(wallets);
      this.settings.set(settings);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن وضعیت درگاه‌ها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }
}
