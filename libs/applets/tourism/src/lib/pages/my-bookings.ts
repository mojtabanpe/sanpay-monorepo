import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BookingReceipt, BookingStatus } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { faNumber, jalali, toman } from '../format';

const STATUS_LABELS: Record<BookingStatus, string> = {
  CONFIRMED: 'قطعی',
  PENDING: 'در انتظار تأیید',
  REJECTED: 'رد شده',
  CANCELED: 'لغو شده',
};

@Component({
  selector: 'tourism-my-bookings',
  imports: [
    RouterLink,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
  ],
  templateUrl: './my-bookings.html',
})
export class MyBookingsPage {
  private readonly tourism = inject(TourismService);

  protected readonly bookings = signal<BookingReceipt[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.bookings.set(await firstValueFrom(this.tourism.myBookings()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected statusLabel(status: BookingStatus): string {
    return STATUS_LABELS[status];
  }

  /** رزرو قطعی سبز، در انتظار کهربایی، بقیه خنثی */
  protected statusVariant(status: BookingStatus): 'default' | 'secondary' {
    return status === 'CONFIRMED' ? 'default' : 'secondary';
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly jalali = jalali;
}
