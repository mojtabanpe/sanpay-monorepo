import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminFlightBookingRow, FlightBookingStatus } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmTableImports } from '@sanpay/ui/table';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import {
  fa,
  FLIGHT_BOOKING_STATUS_LABELS,
  jalaliTime,
  toman,
} from '../../core/format';

@Component({
  selector: 'app-flight-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmTableImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './flight-bookings.html',
})
export class FlightBookings {
  private readonly api = inject(AdminApiService);

  protected readonly fa = fa;
  protected readonly toman = toman;
  protected readonly jalaliTime = jalaliTime;
  protected readonly statusLabels = FLIGHT_BOOKING_STATUS_LABELS;
  protected readonly statuses: Array<FlightBookingStatus | ''> = [
    '',
    'CONFIRMED',
    'PROCESSING',
    'REVIEW',
    'REJECTED',
  ];

  protected readonly rows = signal<AdminFlightBookingRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 30;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly status = signal<FlightBookingStatus | ''>('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.flightBookings({
        q: this.query().trim() || undefined,
        status: this.status() || undefined,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن رزروهای پرواز ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected setStatus(value: FlightBookingStatus | '' | undefined): void {
    this.status.set(value ?? '');
    this.search();
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || (next - 1) * this.pageSize >= this.total()) return;
    this.page.set(next);
    void this.load();
  }

  protected statusVariant(
    status: FlightBookingStatus,
  ): 'default' | 'secondary' | 'destructive' {
    if (status === 'CONFIRMED') return 'default';
    if (status === 'REJECTED') return 'destructive';
    return 'secondary';
  }
}
