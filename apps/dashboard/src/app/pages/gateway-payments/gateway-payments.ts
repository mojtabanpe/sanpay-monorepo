import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import { AdminGatewayPaymentRow, AdminUpgGatewayConfig } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
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
import {
  GATEWAY_PAYMENT_STATUS_LABELS,
  INTENT_PURPOSE_LABELS,
  fa,
  gatewayStatusVariant,
  jalaliTime,
  toman,
} from '../../core/format';

/** پرداخت‌های درگاه UPG — هر تلاش کارت، با فیلتر وضعیت، درگاه، تاریخ و کارمند */
@Component({
  selector: 'app-gateway-payments',
  imports: [
    SanpayDatePickerWidth,
    RouterModule,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmTableImports,
  ],
  templateUrl: './gateway-payments.html',
})
export class GatewayPaymentsPage {
  private readonly api = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly jalaliTime = jalaliTime;
  protected readonly variant = gatewayStatusVariant;
  protected readonly statusLabels = GATEWAY_PAYMENT_STATUS_LABELS;
  protected readonly purposeLabels = INTENT_PURPOSE_LABELS;
  protected readonly statuses = Object.keys(GATEWAY_PAYMENT_STATUS_LABELS);

  protected readonly rows = signal<AdminGatewayPaymentRow[]>([]);
  protected readonly gateways = signal<AdminUpgGatewayConfig[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 30;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly status = signal(
    this.route.snapshot.queryParamMap.get('status') ?? '',
  );
  protected readonly gateway = signal('');
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  /** فیلتر کارمند از پروندهٔ کارمند (`?employeeId=`) */
  protected readonly employeeId = signal(
    this.route.snapshot.queryParamMap.get('employeeId') ?? '',
  );

  protected readonly fromDate = computed(() => {
    const value = this.from();
    return value ? isoToJalali(value) : undefined;
  });
  protected readonly toDate = computed(() => {
    const value = this.to();
    return value ? isoToJalali(value) : undefined;
  });

  constructor() {
    void this.load();
    void this.loadGateways();
  }

  protected statusLabel = (value: unknown): string =>
    value
      ? (this.statusLabels[String(value)] ?? String(value))
      : 'همهٔ وضعیت‌ها';

  protected gatewayLabel = (value: unknown): string =>
    value
      ? (this.gateways().find((g) => g.key === value)?.label ?? String(value))
      : 'همهٔ درگاه‌ها';

  private async loadGateways(): Promise<void> {
    try {
      this.gateways.set((await this.api.upgSettings()).gateways);
    } catch {
      // فقط برای برچسب فیلتر است
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.gatewayPayments({
        q: this.query().trim() || undefined,
        status: this.status() || undefined,
        gateway: this.gateway() || undefined,
        employeeId: this.employeeId() || undefined,
        from: this.from() ? `${this.from()}T00:00:00.000Z` : undefined,
        to: this.to() ? `${this.to()}T23:59:59.999Z` : undefined,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن پرداخت‌های درگاه ممکن نشد'));
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

  protected onGatewayChange(value: unknown): void {
    this.gateway.set((value as string) ?? '');
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
    this.gateway.set('');
    this.employeeId.set('');
    this.from.set(null);
    this.to.set(null);
    this.search();
  }
}
