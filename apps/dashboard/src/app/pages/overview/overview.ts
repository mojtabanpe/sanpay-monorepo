import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AdminOverview } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { HlmTableImports } from '@sanpay/ui/table';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { fa, jalali, jalaliTime, toman } from '../../core/format';

@Component({
  selector: 'app-overview',
  imports: [
    RouterModule,
    HlmBadgeImports,
    HlmCardImports,
    HlmSkeletonImports,
    HlmTableImports,
  ],
  templateUrl: './overview.html',
})
export class OverviewPage {
  private readonly api = inject(AdminApiService);

  protected readonly data = signal<AdminOverview | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly jalali = jalali;
  protected readonly jalaliTime = jalaliTime;

  /** بیشترین مبلغ روزانه — مبنای ارتفاع میله‌های نمودار */
  protected readonly dailyMax = computed(() =>
    Math.max(1, ...(this.data()?.daily ?? []).map((day) => day.amount)),
  );

  /** درصد اعتبار مصرف‌شده */
  protected readonly usage = computed(() => {
    const credit = this.data()?.credit;
    if (!credit || credit.allocated === 0) return 0;
    return Math.round((credit.spent / credit.allocated) * 100);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this.data.set(await this.api.overview());
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن آمار ممکن نشد'));
    }
  }

  protected barHeight(amount: number): string {
    return `${Math.max(4, Math.round((amount / this.dailyMax()) * 100))}%`;
  }
}
