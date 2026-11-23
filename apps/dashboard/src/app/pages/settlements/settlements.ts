import { notifyError } from '../../core/notifications';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleAlert } from '@ng-icons/lucide';
import { HlmPopoverImports } from '@sanpay/ui/popover';
import { HlmTooltip } from '@sanpay/ui/tooltip';
import { Component, computed, inject, signal } from '@angular/core';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmCheckboxImports } from '@sanpay/ui/checkbox';
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
  StoreSettlementPreviews,
  apiError,
} from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { fa, jalaliTime, toman } from '../../core/format';

@Component({
  selector: 'app-settlements',
  providers: [provideIcons({ lucideCircleAlert })],
  imports: [
    NgIcon,
    HlmPopoverImports,
    HlmTooltip,
    SanpayDatePickerWidth,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmCheckboxImports,
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
  /** فقط فروشگاه‌هایی که چیزی برای تسویه دارند در جدول می‌آیند */
  protected readonly storeQuery = signal('');
  protected readonly pendingStores = computed(() => {
    const q = this.storeQuery().trim();
    return this.stores().filter(
      (store) => store.pendingCount > 0 && (!q || store.name.includes(q)),
    );
  });
  protected readonly idleStoreCount = computed(
    () => this.stores().filter((store) => store.pendingCount === 0).length,
  );
  /** قابل انتخاب: خرید تسویه‌نشده و شبای معتبر */
  private readonly selectable = computed(() =>
    this.pendingStores().filter((store) => store.ibanValid),
  );
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedStores = computed(() =>
    this.stores().filter((store) => this.selected().has(store.id)),
  );
  protected readonly selectedAmount = computed(() =>
    this.selectedStores().reduce((sum, store) => sum + store.pendingAmount, 0),
  );
  protected readonly allSelected = computed(() => {
    const rows = this.selectable();
    return rows.length > 0 && rows.every((s) => this.selected().has(s.id));
  });
  protected readonly someSelected = computed(
    () =>
      !this.allSelected() &&
      this.selectable().some((s) => this.selected().has(s.id)),
  );
  protected readonly previews = signal<StoreSettlementPreview[]>([]);
  protected readonly skipped = signal<StoreSettlementPreviews['skipped']>([]);
  protected readonly previewTotal = computed(() =>
    this.previews().reduce((sum, item) => sum + item.totalAmount, 0),
  );
  /** پیشرفت ارسال گروهی؛ null یعنی در حال ارسال نیستیم */
  protected readonly progress = signal<{ done: number; total: number } | null>(
    null,
  );
  protected readonly confirmationOpen = signal<'open' | 'closed'>('closed');
  protected readonly loading = signal(false);
  protected readonly notice = signal<string | null>(null);
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
      notifyError(apiError(caught, 'خواندن تسویه‌ها ممکن نشد'));
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
    return (
      row.batch.canInquire ??
      ['SUBMITTED', 'PROCESSING', 'UNKNOWN'].includes(row.status)
    );
  }

  protected isSelected(storeId: string): boolean {
    return this.selected().has(storeId);
  }

  protected toggleStore(storeId: string, checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (checked) next.add(storeId);
      else next.delete(storeId);
      return next;
    });
  }

  /** «انتخاب همه» فقط فروشگاه‌های قابل تسویهٔ همین فهرست فیلترشده را می‌گیرد */
  protected toggleAll(checked: boolean): void {
    this.selected.update((current) => {
      const next = new Set(current);
      for (const store of this.selectable()) {
        if (checked) next.add(store.id);
        else next.delete(store.id);
      }
      return next;
    });
  }

  protected async showPreview(): Promise<void> {
    const storeIds = [...this.selected()];
    if (!this.canWrite() || !storeIds.length || this.loading()) return;
    await this.action(async () => {
      const result = await this.api.previewSettlements(storeIds);
      this.previews.set(result.previews);
      this.skipped.set(result.skipped);
      this.confirmationOpen.set('open');
    }, false);
  }

  /**
   * هر فروشگاه با توکن امضاشدهٔ خودش و یکی‌یکی ارسال می‌شود؛ خطای یکی بقیه
   * را متوقف نمی‌کند و تکرار همان توکن در سرور دوباره پول نمی‌فرستد.
   */
  protected async run(): Promise<void> {
    const previews = this.previews();
    if (!this.canWrite() || !previews.length || this.loading()) return;
    this.loading.set(true);
    this.notice.set(null);
    const failed: StoreSettlementPreview[] = [];
    this.progress.set({ done: 0, total: previews.length });
    try {
      for (const item of previews) {
        try {
          await this.api.runSettlements(item.storeId, item.previewToken);
        } catch (caught) {
          failed.push(item);
          const message = apiError(caught, 'ارسال تسویه ممکن نشد');
          notifyError(
            previews.length > 1 ? `${item.storeName}: ${message}` : message,
          );
        }
        this.progress.update((p) => p && { ...p, done: p.done + 1 });
      }
      const sent = previews.length - failed.length;
      if (sent > 0)
        this.notice.set(
          failed.length
            ? `تسویهٔ ${fa(sent)} فروشگاه ارسال شد؛ ${fa(failed.length)} فروشگاه ناموفق بود.`
            : `تسویهٔ ${fa(sent)} فروشگاه ارسال شد.`,
        );
      // ناموفق‌ها با همان توکن در پنجره می‌مانند تا دوباره ارسال شوند؛
      // تکرار توکن در سرور هرگز دو بار پول نمی‌فرستد.
      this.previews.set(failed);
      if (!failed.length) {
        this.confirmationOpen.set('closed');
        this.skipped.set([]);
        this.selected.set(new Set());
      }
    } finally {
      this.progress.set(null);
      this.loading.set(false);
    }
    await this.load();
  }

  protected closeConfirmation(state: 'open' | 'closed'): void {
    if (!this.loading()) this.confirmationOpen.set(state);
  }

  protected async reconcile(batchId: string): Promise<void> {
    const previous = this.rows().find((row) => row.batch.id === batchId)?.batch
      .status;
    await this.action(async () => {
      const result = await this.api.reconcileSettlement(batchId);
      if (result.error && result.status !== 'COMPLETED') {
        notifyError(result.error);
        return;
      }
      if (
        result.items.some((item) => item.error && item.status !== 'SUCCEEDED')
      ) {
        notifyError(
          result.items.find((item) => item.error && item.status !== 'SUCCEEDED')
            ?.error ?? 'استعلام حواله نیازمند پیگیری است.',
        );
        return;
      }
      this.notice.set(
        result.status === previous
          ? 'استعلام انجام شد؛ وضعیت دسته هنوز تغییری نکرده است.'
          : `استعلام انجام شد؛ وضعیت دسته: ${this.label(result.status)}`,
      );
    });
  }

  protected async resume(batchId: string): Promise<void> {
    await this.action(async () => {
      const result = await this.api.resumeSettlement(batchId);
      if (
        [-2, -3].includes(result.tomanStatus ?? 0) &&
        result.status !== 'COMPLETED'
      ) {
        notifyError(
          result.error ??
            'پردازش دسته در تومان ناموفق است؛ نتیجه حواله‌ها را استعلام کنید.',
        );
      }
    });
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
    this.notice.set(null);
    try {
      await action();
      if (reload) await this.load();
    } catch (caught) {
      if (reload) await this.load();
      notifyError(apiError(caught, 'انجام عملیات تسویه ممکن نشد'));
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
