import { Component, inject, signal } from '@angular/core';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmTableImports } from '@sanpay/ui/table';
import {
  AdminApiService,
  SettlementBatchView,
  apiError,
} from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { jalaliTime, toman } from '../../core/format';

@Component({
  selector: 'app-settlements',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmTableImports,
  ],
  templateUrl: './settlements.html',
})
export class Settlements {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly rows = signal<SettlementBatchView[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canWrite = this.auth.canWrite;
  protected readonly toman = toman;
  protected readonly jalaliTime = jalaliTime;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.rows.set(await this.api.settlements());
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن تسویه‌ها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async run(): Promise<void> {
    await this.action(() => this.api.runSettlements());
  }

  protected async retry(itemId: string): Promise<void> {
    await this.action(() => this.api.retrySettlementItem(itemId));
  }

  protected label(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  private async action(action: () => Promise<unknown>): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
      await this.load();
    } catch (caught) {
      this.error.set(apiError(caught, 'انجام عملیات تسویه ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }
}

const STATUS_LABELS: Record<string, string> = {
  BUILDING: 'در حال ساخت',
  CREATED: 'آماده ارسال',
  SUBMITTED: 'ارسال‌شده',
  PROCESSING: 'در حال پردازش',
  COMPLETED: 'کامل',
  PARTIAL_FAILED: 'بخشی ناموفق',
  SUCCEEDED: 'موفق',
  FAILED: 'ناموفق',
  UNKNOWN: 'نامشخص',
};
