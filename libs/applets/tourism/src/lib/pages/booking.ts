import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BookingQuote, BookingReceipt } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { faNumber, jalali, jalaliLong, toman } from '../format';

@Component({
  selector: 'tourism-booking',
  imports: [
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
  ],
  templateUrl: './booking.html',
})
export class BookingPage {
  private readonly tourism = inject(TourismService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly quote = signal<BookingQuote | null>(null);
  protected readonly receipt = signal<BookingReceipt | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly nationalCode = signal('');
  protected readonly mobile = signal('');
  protected readonly allocationId = signal('');

  private readonly params = this.route.snapshot.queryParamMap;
  private readonly hotelId = Number(this.params.get('hotelId'));
  private readonly roomId = Number(this.params.get('roomId'));
  private readonly checkin = this.params.get('checkin') ?? '';
  private readonly nights = Number(this.params.get('nights') ?? 1);

  protected readonly selectedWallet = computed(() =>
    this.quote()?.wallets.find(
      (wallet) => wallet.allocationId === this.allocationId(),
    ),
  );

  /** ماندهٔ کیف پول انتخاب‌شده کفاف مبلغ رزرو را می‌دهد؟ */
  protected readonly enoughCredit = computed(() => {
    const wallet = this.selectedWallet();
    const amount = this.quote()?.amount ?? 0;
    return !!wallet && wallet.max >= amount;
  });

  protected readonly formValid = computed(
    () =>
      this.firstName().trim().length > 1 &&
      this.lastName().trim().length > 1 &&
      /^\d{10}$/.test(this.nationalCode()) &&
      /^09\d{9}$/.test(this.mobile()) &&
      this.enoughCredit(),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const quote = await firstValueFrom(
        this.tourism.quote(
          this.hotelId,
          this.roomId,
          this.checkin,
          this.nights,
        ),
      );
      this.quote.set(quote);
      // تک کیف پول = بدون انتخاب دستی؛ چند کیف پول = اولین کیف پولِ کافی
      const affordable = quote.wallets.find(
        (wallet) => wallet.max >= quote.amount,
      );
      this.allocationId.set(
        (affordable ?? quote.wallets[0])?.allocationId ?? '',
      );
    } catch (error) {
      this.error.set(message(error, 'دریافت اطلاعات رزرو ناموفق بود'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async confirm(): Promise<void> {
    if (!this.formValid() || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      this.receipt.set(
        await firstValueFrom(
          this.tourism.book({
            hotelId: this.hotelId,
            roomId: this.roomId,
            checkin: this.checkin,
            nights: this.nights,
            allocationId: this.allocationId(),
            guest: {
              firstName: this.firstName().trim(),
              lastName: this.lastName().trim(),
              nationalCode: this.nationalCode().trim(),
              mobile: this.mobile().trim(),
            },
          }),
        ),
      );
    } catch (error) {
      this.error.set(message(error, 'ثبت رزرو ناموفق بود'));
    } finally {
      this.busy.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate(['/tourism/hotels', this.hotelId], {
      queryParams: { checkin: this.checkin, nights: this.nights },
    });
  }

  protected done(): void {
    void this.router.navigate(['/tourism/bookings']);
  }

  protected stayLabel(quote: BookingQuote): string {
    // «—» و نه «•» — نقطه‌وسط کنار رقم فارسی شبیه صفر خوانده می‌شود
    return `${jalaliLong(quote.checkin)} تا ${jalaliLong(quote.checkout)} — ${faNumber(quote.nights)} شب`;
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly jalali = jalali;
}

/** پیام خطای فارسیِ بک‌اند را نشان می‌دهیم، نه متن خام HTTP */
function message(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.message;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && typeof detail[0] === 'string') return detail[0];
  }
  return fallback;
}
