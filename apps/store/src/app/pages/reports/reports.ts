import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import {
  StorePaymentReport,
  StorePaymentReportFilters,
  StoreSettlementStatus,
} from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmTableImports } from '@sanpay/ui/table';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { StorePaymentsService } from '../../core/payments.service';
import { StoreAuthService } from '../../core/store-auth.service';
import { printSheet } from '../../core/print-sheet';

@Component({
  selector: 'store-reports',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmInputImports,
    SanpayDatePickerWidth,
    HlmLabelImports,
    HlmSelectImports,
    HlmTableImports,
  ],
  templateUrl: './reports.html',
})
export class Reports {
  private readonly payments = inject(StorePaymentsService);
  private readonly auth = inject(StoreAuthService);

  protected readonly store = this.auth.profile;
  protected readonly report = signal<StorePaymentReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly query = signal('');
  /** تاریخ‌ها `YYYY-MM-DD` میلادی (زبان API)؛ کاربر جلالی انتخاب می‌کند */
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly fromDate = computed(() =>
    this.from() ? isoToJalali(this.from()) : undefined,
  );
  protected readonly toDate = computed(() =>
    this.to() ? isoToJalali(this.to()) : undefined,
  );
  protected readonly settlementStatus = signal<StoreSettlementStatus | ''>('');
  protected readonly companyId = signal('');
  protected readonly walletDefinitionId = signal('');
  protected readonly filters = signal<StorePaymentReportFilters>({
    wallets: [],
    companies: [],
  });
  /** کیف‌پول‌های قابل انتخاب — با شرکت انتخاب‌شده محدود می‌شود */
  protected readonly walletOptions = computed(() => {
    const companyId = this.companyId();
    const wallets = this.filters().wallets;
    return companyId
      ? wallets.filter((wallet) => wallet.companyId === companyId)
      : wallets;
  });
  protected readonly page = signal(1);
  protected readonly pageSize = 50;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.report()?.total ?? 0) / this.pageSize)),
  );

  private readonly numberFormatter = new Intl.NumberFormat('fa-IR');
  private readonly dateTimeFormatter = new Intl.DateTimeFormat(
    'fa-IR-u-ca-persian',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    },
  );

  protected readonly statusLabels: Record<StoreSettlementStatus, string> = {
    PENDING: 'در انتظار تسویه',
    PROCESSING: 'در حال تسویه',
    SUCCEEDED: 'تسویه‌شده',
    FAILED: 'ناموفق',
  };

  protected readonly companyLabel = (value: unknown): string =>
    !value
      ? 'همه شرکت‌ها'
      : (this.filters().companies.find((c) => c.id === value)?.name ?? 'شرکت');
  protected readonly walletLabel = (value: unknown): string =>
    !value
      ? 'همه کیف‌پول‌ها'
      : (this.filters().wallets.find((w) => w.id === value)?.name ?? 'کیف پول');
  protected readonly statusLabel = (value: unknown): string =>
    !value
      ? 'همه وضعیت‌ها'
      : (this.statusLabels[value as StoreSettlementStatus] ?? '');

  constructor() {
    void this.load();
    void this.loadFilters();
  }

  private async loadFilters(): Promise<void> {
    try {
      this.filters.set(await this.payments.reportFilters());
    } catch {
      // فقط برای فیلتر است؛ خطایش نباید گزارش را خراب کند
    }
  }

  protected onCompanyChange(value: string): void {
    this.companyId.set(value);
    const wallet = this.filters().wallets.find(
      (item) => item.id === this.walletDefinitionId(),
    );
    if (wallet && value && wallet.companyId !== value) {
      this.walletDefinitionId.set('');
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.report.set(
        await this.payments.report({
          ...this.reportQuery(),
          page: this.page(),
          pageSize: this.pageSize,
        }),
      );
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected clearFilters(): void {
    this.query.set('');
    this.from.set('');
    this.to.set('');
    this.settlementStatus.set('');
    this.companyId.set('');
    this.walletDefinitionId.set('');
    this.search();
  }

  protected onFromChange(date: JalaliDate | undefined): void {
    this.from.set(date ? jalaliToIso(date) : '');
  }

  protected onToChange(date: JalaliDate | undefined): void {
    this.to.set(date ? jalaliToIso(date) : '');
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || next > this.pageCount()) return;
    this.page.set(next);
    void this.load();
  }

  private reportQuery() {
    return {
      q: this.query().trim() || undefined,
      from: this.from() ? `${this.from()}T00:00:00+03:30` : undefined,
      to: this.to() ? `${this.to()}T23:59:59.999+03:30` : undefined,
      settlementStatus: this.settlementStatus() || undefined,
      companyId: this.companyId() || undefined,
      walletDefinitionId: this.walletDefinitionId() || undefined,
    };
  }

  protected readonly exporting = signal(false);
  protected readonly actionError = signal('');

  protected async exportExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.actionError.set('');
    try {
      await this.payments.downloadReportExcel(this.reportQuery());
    } catch {
      this.actionError.set('ساخت خروجی اکسل ممکن نشد.');
    } finally {
      this.exporting.set(false);
    }
  }

  /** همهٔ سطرهای فیلترشده برای چاپ — فقط هنگام چاپ پر می‌شود */
  protected readonly printRows = signal<StorePaymentReport['items']>([]);
  protected readonly printSum = computed(() =>
    this.printRows().reduce((sum, row) => sum + row.amount, 0),
  );
  protected readonly printing = signal(false);
  private readonly printRef = viewChild<ElementRef<HTMLElement>>('printArea');

  /** شرح فیلترها در سربرگ چاپ */
  protected readonly filterSummary = computed(() => {
    const parts: string[] = [];
    const company = this.filters().companies.find(
      (item) => item.id === this.companyId(),
    );
    if (company) parts.push(`شرکت: ${company.name}`);
    const wallet = this.filters().wallets.find(
      (item) => item.id === this.walletDefinitionId(),
    );
    if (wallet) parts.push(`کیف پول: ${wallet.name}`);
    if (this.from()) parts.push(`از ${this.dateOnly(this.from())}`);
    if (this.to()) parts.push(`تا ${this.dateOnly(this.to())}`);
    const status = this.settlementStatus();
    if (status) parts.push(`تسویه: ${this.statusLabels[status]}`);
    if (this.query().trim()) parts.push(`جست‌وجو: ${this.query().trim()}`);
    return parts.join(' — ') || 'همهٔ پرداخت‌ها';
  });

  private readonly dateFormatter = new Intl.DateTimeFormat(
    'fa-IR-u-ca-persian',
    { year: 'numeric', month: '2-digit', day: '2-digit' },
  );

  private dateOnly(iso: string): string {
    return this.dateFormatter.format(new Date(`${iso}T12:00:00`));
  }

  /** همهٔ صفحه‌های فیلترشده را می‌گیرد و فقط جدول چاپی را چاپ می‌کند */
  protected async print(): Promise<void> {
    if (this.printing()) return;
    this.printing.set(true);
    this.actionError.set('');
    try {
      const pageSize = 200;
      const all: StorePaymentReport['items'] = [];
      for (let page = 1; ; page++) {
        const result = await this.payments.report({
          ...this.reportQuery(),
          page,
          pageSize,
        });
        all.push(...result.items);
        if (all.length >= result.total || result.items.length === 0) break;
      }
      this.printRows.set(all);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const element = this.printRef()?.nativeElement;
      if (element) printSheet(element);
    } catch {
      this.actionError.set('آماده‌سازی چاپ ممکن نشد.');
    } finally {
      this.printing.set(false);
    }
  }

  protected rial(value: number): string {
    return `${this.numberFormatter.format(value)} ریال`;
  }

  protected count(value: number): string {
    return this.numberFormatter.format(value);
  }

  protected dateTime(value: string | null): string {
    return value ? this.dateTimeFormatter.format(new Date(value)) : '—';
  }

  protected statusVariant(
    status: StoreSettlementStatus,
  ): 'default' | 'secondary' | 'destructive' {
    if (status === 'SUCCEEDED') return 'default';
    if (status === 'FAILED') return 'destructive';
    return 'secondary';
  }
}
