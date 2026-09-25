import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FlightAirport,
  FlightBookingReceipt,
  FlightBookingStatus,
} from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { FlightsService } from '../data-access/flights.service';
import { jalaliLong, toman } from '../format';

@Component({
  selector: 'tourism-flight-bookings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
  ],
  templateUrl: './flight-bookings.html',
})
export class FlightBookingsPage {
  private readonly api = inject(FlightsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly bookings = signal<FlightBookingReceipt[]>([]);
  protected readonly airports = signal<FlightAirport[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  private loadingRequest = false;

  constructor() {
    void this.load();
    const timer = setInterval(() => {
      if (
        this.bookings().some(
          (booking) =>
            booking.status === 'PROCESSING' || booking.status === 'REVIEW',
        )
      )
        void this.load(false);
    }, 10000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected async load(showLoading = true): Promise<void> {
    if (this.loadingRequest) return;
    this.loadingRequest = true;
    if (showLoading) this.loading.set(true);
    this.error.set(false);
    try {
      const [bookings, airports] = await Promise.all([
        firstValueFrom(this.api.bookings()),
        firstValueFrom(this.api.airports()).catch(() => []),
      ]);
      this.bookings.set(bookings);
      this.airports.set(airports);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
      this.loadingRequest = false;
    }
  }

  protected airportName(iata: string): string {
    return (
      this.airports().find((airport) => airport.iata === iata)?.name ?? iata
    );
  }

  protected statusLabel(status: FlightBookingStatus): string {
    return {
      CONFIRMED: 'رزرو قطعی',
      PROCESSING: 'در حال صدور',
      REVIEW: 'در انتظار بررسی',
      REJECTED: 'رزرو ناموفق',
    }[status];
  }

  protected statusVariant(
    status: FlightBookingStatus,
  ): 'default' | 'secondary' {
    return status === 'CONFIRMED' ? 'default' : 'secondary';
  }

  protected readonly money = toman;
  protected readonly dateLabel = jalaliLong;
}
