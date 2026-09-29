import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { StorePaymentReport, StoreSettlementStatus } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { HlmNativeSelectImports } from '@sanpay/ui/native-select';
import { HlmTableImports } from '@sanpay/ui/table';
import { StorePaymentsService } from '../../core/payments.service';
import { StoreAuthService } from '../../core/store-auth.service';

@Component({
  selector: 'store-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmLabelImports,
    HlmNativeSelectImports,
    HlmTableImports,
  ],
  templateUrl: './reports.html',
  styles: `
    @media print {
      :host {
        display: block;
      }
      .report-root {
        max-width: none;
        padding: 0;
      }
      .report-card {
        border: 0;
        box-shadow: none;
      }
      table {
        font-size: 10px;
      }
    }
  `,
})
export class Reports {
  private readonly payments = inject(StorePaymentsService);
  private readonly auth = inject(StoreAuthService);

  protected readonly store = this.auth.profile;
  protected readonly report = signal<StorePaymentReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly query = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly settlementStatus = signal<StoreSettlementStatus | ''>('');
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

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.report.set(
        await this.payments.report({
          q: this.query().trim() || undefined,
          from: this.from() ? `${this.from()}T00:00:00+03:30` : undefined,
          to: this.to() ? `${this.to()}T23:59:59.999+03:30` : undefined,
          settlementStatus: this.settlementStatus() || undefined,
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
    this.search();
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || next > this.pageCount()) return;
    this.page.set(next);
    void this.load();
  }

  protected print(): void {
    window.print();
  }

  protected toman(value: number): string {
    return `${this.numberFormatter.format(value)} تومان`;
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
