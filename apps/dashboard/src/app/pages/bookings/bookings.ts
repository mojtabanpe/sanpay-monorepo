import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AdminBookingRow } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmTableImports } from '@sanpay/ui/table';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { BOOKING_STATUS_LABELS, fa, jalali, jalaliTime, toman } from '../../core/format';

/** رزروهای هتل (اعتبار گردشگری) — وضعیت، بدهی به هتل‌یار و تسویه */
@Component({
  selector: 'app-bookings',
  imports: [
    RouterModule,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmTableImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './bookings.html',
})
export class BookingsPage {
  private readonly api = inject(AdminApiService);

  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly jalali = jalali;
  protected readonly jalaliTime = jalaliTime;
  protected readonly statusLabels = BOOKING_STATUS_LABELS;
  protected readonly statuses = ['', 'CONFIRMED', 'PENDING', 'REJECTED', 'CANCELED'];

  protected readonly rows = signal<AdminBookingRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 30;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly query = signal('');
  protected readonly status = signal('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.bookings({
        q: this.query().trim() || undefined,
        status: this.status() || undefined,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن رزروها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected setStatus(value: string | undefined): void {
    this.status.set(value ?? '');
    this.search();
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || (next - 1) * this.pageSize >= this.total()) return;
    this.page.set(next);
    void this.load();
  }

  protected statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
    if (status === 'CONFIRMED') return 'default';
    if (status === 'REJECTED' || status === 'CANCELED') return 'destructive';
    return 'secondary';
  }
}
