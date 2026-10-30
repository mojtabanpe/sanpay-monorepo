import { Component, computed, inject, signal } from '@angular/core';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmDialogImports } from '@sanpay/ui/dialog';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmTableImports } from '@sanpay/ui/table';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import {
  AdminApiService,
  SettlementItemRow,
  SettlementStoreOption,
  StoreSettlementPreview,
  apiError,
} from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { fa, jalaliTime, toman } from '../../core/format';

@Component({
  selector: 'app-settlements',
  imports: [
    SanpayDatePickerWidth,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTableImports,
    HlmDialogImports,
    HlmSelectImports,
  ],
  templateUrl: './settlements.html',
})
export class Settlements {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly rows = signal<SettlementItemRow[]>([]);
  protected readonly total = signal(0);
  /** جمع مبلغ همهٔ صفحه‌های فیلترشده — از سرور، نه جمع صفحهٔ جاری */
  protected readonly sumAmount = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 30;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );

  // فیلترها
  protected readonly query = signal('');
  protected readonly status = signal('');
  protected readonly beneficiaryType = signal('');
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly fromDate = computed(() => {
    const value = this.from();
    return value ? isoToJalali(value) : undefined;
  });
  protected readonly toDate = computed(() => {
    const value = this.to();
    return value ? isoToJalali(value) : undefined;
  });
  protected readonly statusOptions = ITEM_STATUSES;
  protected readonly typeOptions = Object.keys(BENEFICIARY_LABELS);
  protected readonly statusFilterLabel = (value: unknown) =>
    value ? this.label(String(value)) : 'همهٔ وضعیت‌ها';
  protected readonly typeFilterLabel = (value: unknown) =>
    value ? this.typeLabel(String(value)) : 'همهٔ ذی‌نفع‌ها';

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
  protected readonly fa = fa;
  protected readonly jalaliTime = jalaliTime;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [result, stores] = await Promise.all([
        this.api.settlementItems({
          q: this.query().trim() || undefined,
          status: this.status() || undefined,
          beneficiaryType: this.beneficiaryType() || undefined,
          from: this.from() ?? undefined,
          to: this.to() ?? undefined,
          page: this.page(),
          pageSize: this.pageSize,
        }),
        this.canWrite() ? this.api.settlementStores() : Promise.resolve([]),
      ]);
      this.rows.set(result.items);
      this.total.set(result.total);
      this.sumAmount.set(result.sumAmount);
      this.stores.set(stores);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن تسویه‌ها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || (next - 1) * this.pageSize >= this.total()) return;
    this.page.set(next);
    void this.load();
  }

  protected onStatusChange(value: unknown): void {
    this.status.set((value as string) ?? '');
    this.search();
  }

  protected onTypeChange(value: unknown): void {
    this.beneficiaryType.set((value as string) ?? '');
    this.search();
  }

  protected onFromChange(date: JalaliDate | undefined): void {
    this.from.set(date ? jalaliToIso(date) : null);
    this.search();
  }

  protected onToChange(date: JalaliDate | undefined): void {
    this.to.set(date ? jalaliToIso(date) : null);
    this.search();
  }

  protected clearFilters(): void {
    this.query.set('');
    this.status.set('');
    this.beneficiaryType.set('');
    this.from.set(null);
    this.to.set(null);
    this.search();
  }

  /** انتقالی که هنوز نهایی نشده — استعلام وضعیت دسته‌اش معنا دارد */
  protected inquirable(row: SettlementItemRow): boolean {
    return row.status !== 'SUCCEEDED' && row.status !== 'FAILED';
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

  protected typeLabel(type: string): string {
    return BENEFICIARY_LABELS[type] ?? type;
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

const ITEM_STATUSES = [
  'CREATED',
  'SUBMITTED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN',
];

const BENEFICIARY_LABELS: Record<string, string> = {
  STORE: 'فروشگاه',
  HOTELYAR: 'هتل‌یار',
  EGHAMAT24: 'اقامت۲۴',
};

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
