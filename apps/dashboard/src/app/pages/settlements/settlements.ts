import { Component, computed, inject, signal } from '@angular/core';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDialogImports } from '@sanpay/ui/dialog';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmTableImports } from '@sanpay/ui/table';
import {
  AdminApiService,
  SettlementBatchView,
  SettlementStoreOption,
  StoreSettlementPreview,
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
    HlmDialogImports,
    HlmSelectImports,
  ],
  templateUrl: './settlements.html',
})
export class Settlements {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly rows = signal<SettlementBatchView[]>([]);
  protected readonly stores = signal<SettlementStoreOption[]>([]);
  protected readonly storeId = signal('');
  protected readonly preview = signal<StoreSettlementPreview | null>(null);
  protected readonly confirmationOpen = signal<'open' | 'closed'>('closed');
  protected readonly storeLabel = (value: unknown) =>
    this.stores().find((store) => store.id === value)?.name ?? '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly canWrite = computed(() =>
    this.auth.hasPermission('settlements:write'),
  );
  protected readonly toman = toman;
  protected readonly jalaliTime = jalaliTime;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [rows, stores] = await Promise.all([
        this.api.settlements(),
        this.canWrite() ? this.api.settlementStores() : Promise.resolve([]),
      ]);
      this.rows.set(rows);
      this.stores.set(stores);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن تسویه‌ها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async showPreview(): Promise<void> {
    if (!this.canWrite() || !this.storeId() || this.loading()) return;
    await this.action(async () => {
      this.preview.set(await this.api.previewSettlement(this.storeId()));
      this.confirmationOpen.set('open');
    }, false);
  }

  protected async run(): Promise<void> {
    const preview = this.preview();
    if (!this.canWrite() || !preview) return;
    await this.action(async () => {
      await this.api.runSettlements(preview.storeId, preview.previewToken);
      this.confirmationOpen.set('closed');
      this.preview.set(null);
    });
  }

  protected closeConfirmation(state: 'open' | 'closed'): void {
    if (!this.loading()) this.confirmationOpen.set(state);
  }

  protected async reconcile(batchId: string): Promise<void> {
    await this.action(() => this.api.reconcileSettlement(batchId));
  }

  protected async retry(itemId: string): Promise<void> {
    await this.action(() => this.api.retrySettlementItem(itemId));
  }

  protected label(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  private async action(
    action: () => Promise<unknown>,
    reload = true,
  ): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
      if (reload) await this.load();
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
