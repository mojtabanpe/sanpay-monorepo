import { notifyError } from '../../core/notifications';
import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import {
  AdminCompanyRow,
  AdminPaymentRow,
  AdminStoreRow,
  AdminWalletDefinitionRow,
} from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmTableImports } from '@sanpay/ui/table';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { fa, jalali, jalaliTime, toman } from '../../core/format';
import { printSheet } from '../../core/print-sheet';

/** گزارش پرداخت‌ها با فیلتر فروشگاه و بازهٔ تاریخ */
@Component({
  selector: 'app-payments',
  imports: [
    SanpayDatePickerWidth,
    RouterModule,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmTableImports,
  ],
  templateUrl: './payments.html',
})
export class PaymentsPage {
  private readonly api = inject(AdminApiService);

  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly jalaliTime = jalaliTime;

  protected readonly rows = signal<AdminPaymentRow[]>([]);
  protected readonly stores = signal<AdminStoreRow[]>([]);
  protected readonly companies = signal<AdminCompanyRow[]>([]);
  protected readonly wallets = signal<AdminWalletDefinitionRow[]>([]);
  /** کیف‌پول‌های قابل انتخاب — با شرکت انتخاب‌شده محدود می‌شود */
  protected readonly walletOptions = computed(() => {
    const companyId = this.companyId();
    return companyId
      ? this.wallets().filter((wallet) => wallet.company.id === companyId)
      : this.wallets();
  });
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 30;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );
  protected readonly loading = signal(false);

  protected readonly query = signal('');
  protected readonly storeId = signal('');
  protected readonly companyId = signal('');
  protected readonly walletDefinitionId = signal('');
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly settlementStatus = signal('');

  protected readonly fromDate = computed(() => {
    const value = this.from();
    return value ? isoToJalali(value) : undefined;
  });
  protected readonly toDate = computed(() => {
    const value = this.to();
    return value ? isoToJalali(value) : undefined;
  });

  /** جمع مبلغ همهٔ صفحه‌های فیلترشده — از سرور، نه جمع صفحهٔ جاری */
  protected readonly sumAmount = signal(0);

  /** همهٔ سطرهای فیلترشده برای چاپ — فقط هنگام چاپ پر می‌شود */
  protected readonly printRows = signal<AdminPaymentRow[]>([]);
  protected readonly printing = signal(false);
  private readonly printRef = viewChild<ElementRef<HTMLElement>>('printArea');
  protected readonly printSum = computed(() =>
    this.printRows().reduce((sum, row) => sum + row.amount, 0),
  );

  constructor() {
    void this.load();
    void this.loadStores();
    void this.loadCompanies();
    void this.loadWallets();
  }

  protected companyLabel = (value: unknown): string =>
    value === '' || value === undefined
      ? 'همهٔ شرکت‌ها'
      : (this.companies().find((company) => company.id === value)?.name ??
        'شرکت');

  protected walletLabel = (value: unknown): string => {
    if (value === '' || value === undefined) return 'همهٔ کیف‌پول‌ها';
    const wallet = this.wallets().find((item) => item.id === value);
    return wallet ? this.walletText(wallet) : 'کیف پول';
  };

  protected walletText(wallet: AdminWalletDefinitionRow): string {
    return this.companyId()
      ? wallet.name
      : `${wallet.name} — ${wallet.company.name}`;
  }

  private async loadCompanies(): Promise<void> {
    try {
      const result = await this.api.companies({ pageSize: 200 });
      this.companies.set(result.items);
    } catch {
      // فقط برای فیلتر است
    }
  }

  private async loadWallets(): Promise<void> {
    try {
      const result = await this.api.walletDefinitions({ pageSize: 200 });
      this.wallets.set(result.items);
    } catch {
      // فقط برای فیلتر است
    }
  }

  protected onCompanyChange(value: unknown): void {
    this.companyId.set((value as string) ?? '');
    // کیف پولِ شرکت دیگر با این فیلتر هیچ نتیجه‌ای نمی‌دهد
    const wallet = this.wallets().find(
      (item) => item.id === this.walletDefinitionId(),
    );
    if (wallet && this.companyId() && wallet.company.id !== this.companyId()) {
      this.walletDefinitionId.set('');
    }
    this.search();
  }

  protected onWalletChange(value: unknown): void {
    this.walletDefinitionId.set((value as string) ?? '');
    this.search();
  }

  protected storeLabel = (value: unknown): string =>
    value === '' || value === undefined
      ? 'همهٔ فروشگاه‌ها'
      : (this.stores().find((store) => store.id === value)?.name ?? 'فروشگاه');

  private async loadStores(): Promise<void> {
    try {
      const result = await this.api.stores({ pageSize: 200 });
      this.stores.set(result.items);
    } catch {
      // فهرست فروشگاه فقط برای فیلتر است؛ خطایش نباید جدول را خراب کند
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.payments({
        ...this.reportQuery(),
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
      this.sumAmount.set(result.sumAmount);
    } catch (caught) {
      notifyError(apiError(caught, 'خواندن پرداخت‌ها ممکن نشد'));
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

  protected onStoreChange(value: unknown): void {
    this.storeId.set((value as string) ?? '');
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
    this.storeId.set('');
    this.companyId.set('');
    this.walletDefinitionId.set('');
    this.from.set(null);
    this.to.set(null);
    this.settlementStatus.set('');
    this.search();
  }

  protected async exportExcel(): Promise<void> {
    try {
      await this.api.downloadPaymentsExcel(this.reportQuery());
    } catch (caught) {
      notifyError(apiError(caught, 'ساخت خروجی اکسل ممکن نشد'));
    }
  }

  /** همهٔ صفحه‌های فیلترشده را می‌گیرد و فقط همان جدول را چاپ می‌کند */
  protected async print(): Promise<void> {
    if (this.printing()) return;
    this.printing.set(true);
    try {
      const pageSize = 200;
      const all: AdminPaymentRow[] = [];
      for (let page = 1; ; page++) {
        const result = await this.api.payments({
          ...this.reportQuery(),
          page,
          pageSize,
        });
        all.push(...result.items);
        if (all.length >= result.total || result.items.length === 0) break;
      }
      this.printRows.set(all);
      // یک فریم صبر تا جدول چاپی رندر شود
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const element = this.printRef()?.nativeElement;
      if (element) printSheet(element);
    } catch (caught) {
      notifyError(apiError(caught, 'آماده‌سازی چاپ ممکن نشد'));
    } finally {
      this.printing.set(false);
    }
  }

  /** شرح فیلترها در سربرگ چاپ */
  protected readonly filterSummary = computed(() => {
    const parts: string[] = [];
    const store = this.stores().find((item) => item.id === this.storeId());
    if (store) parts.push(`فروشگاه: ${store.name}`);
    const company = this.companies().find(
      (item) => item.id === this.companyId(),
    );
    if (company) parts.push(`شرکت: ${company.name}`);
    const wallet = this.wallets().find(
      (item) => item.id === this.walletDefinitionId(),
    );
    if (wallet) parts.push(`کیف پول: ${wallet.name}`);
    if (this.from()) parts.push(`از ${jalali(`${this.from()}T12:00:00`)}`);
    if (this.to()) parts.push(`تا ${jalali(`${this.to()}T12:00:00`)}`);
    const status = this.settlementStatus();
    if (status) parts.push(`تسویه: ${settlementLabels[status]}`);
    if (this.query().trim()) parts.push(`جست‌وجو: ${this.query().trim()}`);
    return parts.join(' — ') || 'همهٔ پرداخت‌ها';
  });

  protected onSettlementChange(value: unknown): void {
    this.settlementStatus.set((value as string) ?? '');
    this.search();
  }

  protected settlementLabel(value: unknown): string {
    return settlementLabels[String(value)] ?? 'همهٔ وضعیت‌ها';
  }

  protected settlementText(
    status: AdminPaymentRow['settlement']['status'],
  ): string {
    return settlementLabels[status] ?? status;
  }

  private reportQuery() {
    return {
      q: this.query().trim() || undefined,
      storeId: this.storeId() || undefined,
      companyId: this.companyId() || undefined,
      walletDefinitionId: this.walletDefinitionId() || undefined,
      from: this.from() ? `${this.from()}T00:00:00.000Z` : undefined,
      to: this.to() ? `${this.to()}T23:59:59.999Z` : undefined,
      settlementStatus: this.settlementStatus() || undefined,
    };
  }
}

const settlementLabels: Record<string, string> = {
  '': 'همهٔ وضعیت‌ها',
  PENDING: 'در انتظار ارسال',
  PROCESSING: 'در حال پردازش',
  SUCCEEDED: 'واریزشده',
  FAILED: 'ناموفق',
};
