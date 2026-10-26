import { Component, computed, inject, signal } from '@angular/core';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import { AdminTourismSplitReport } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmTableImports } from '@sanpay/ui/table';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { fa, jalaliTime, toman } from '../../core/format';

type Kind = '' | 'HOTEL' | 'FLIGHT';

/**
 * تفکیک پرداخت‌های گردشگری به اعتبار (بن) و کارت درگاه، به‌ازای هر شخص — مبنای
 * صدور فاکتور مودیان برای مابه‌التفاوتی که با کارت پرداخت شده.
 */
@Component({
  selector: 'app-tourism-split',
  imports: [
    SanpayDatePickerWidth,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTableImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './tourism-split.html',
})
export class TourismSplit {
  private readonly api = inject(AdminApiService);

  protected readonly fa = fa;
  protected readonly toman = toman;
  protected readonly jalaliTime = jalaliTime;

  protected readonly report = signal<AdminTourismSplitReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly kind = signal<Kind>('');
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  /** شخصی که ریز خریدهایش باز است */
  protected readonly openEmployeeId = signal<string | null>(null);

  protected readonly fromDate = computed(() => {
    const value = this.from();
    return value ? isoToJalali(value) : undefined;
  });
  protected readonly toDate = computed(() => {
    const value = this.to();
    return value ? isoToJalali(value) : undefined;
  });

  protected readonly openItems = computed(() => {
    const id = this.openEmployeeId();
    return id
      ? (this.report()?.items ?? []).filter((item) => item.employeeId === id)
      : [];
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.report.set(await this.api.tourismSplit(this.filters()));
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن گزارش ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async exportExcel(): Promise<void> {
    this.error.set(null);
    try {
      await this.api.downloadTourismSplitExcel(this.filters());
    } catch (caught) {
      this.error.set(apiError(caught, 'ساخت خروجی اکسل ممکن نشد'));
    }
  }

  protected setKind(value: Kind | undefined): void {
    this.kind.set(value ?? '');
    void this.load();
  }

  protected onFromChange(date: JalaliDate | undefined): void {
    this.from.set(date ? jalaliToIso(date) : null);
    void this.load();
  }

  protected onToChange(date: JalaliDate | undefined): void {
    this.to.set(date ? jalaliToIso(date) : null);
    void this.load();
  }

  protected toggle(employeeId: string): void {
    this.openEmployeeId.update((current) =>
      current === employeeId ? null : employeeId,
    );
  }

  private filters() {
    return {
      q: this.query().trim() || undefined,
      kind: this.kind() || undefined,
      from: this.from() ? `${this.from()}T00:00:00.000Z` : undefined,
      to: this.to() ? `${this.to()}T23:59:59.999Z` : undefined,
    };
  }
}
