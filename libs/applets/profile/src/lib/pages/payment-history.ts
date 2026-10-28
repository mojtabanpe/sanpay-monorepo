import { Component, computed, inject, signal } from '@angular/core';
import { ReceiptCard } from '@sanpay/receipt';
import { PaymentHistoryItem, Receipt } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';
import { faNumber, jalaliTime, toman } from '../format';

@Component({
  selector: 'profile-payment-history',
  imports: [
    HlmButtonImports,
    HlmCardImports,
    HlmSheetImports,
    HlmSkeletonImports,
    ReceiptCard,
  ],
  templateUrl: './payment-history.html',
})
export class PaymentHistoryPage {
  private readonly profileService = inject(ProfileService);

  protected readonly payments = signal<PaymentHistoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly selectedStore = signal('');
  protected readonly stores = computed(() =>
    [...new Set(this.payments().map((payment) => payment.storeName))].sort(
      (a, b) => a.localeCompare(b, 'fa'),
    ),
  );
  protected readonly filteredPayments = computed(() => {
    const store = this.selectedStore();
    return store
      ? this.payments().filter((payment) => payment.storeName === store)
      : this.payments();
  });

  protected readonly total = computed(() =>
    this.filteredPayments().reduce((sum, payment) => sum + payment.amount, 0),
  );

  protected readonly receipt = signal<Receipt | null>(null);
  protected readonly receiptOpen = signal(false);
  /** رسیدی که در حال دریافت است — برای غیرفعال‌کردن دکمهٔ همان سطر */
  protected readonly receiptLoading = signal<string | null>(null);
  protected readonly receiptError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected async showReceipt(payment: PaymentHistoryItem): Promise<void> {
    if (this.receiptLoading()) return;
    this.receiptLoading.set(payment.id);
    this.receiptError.set(null);
    try {
      this.receipt.set(
        await firstValueFrom(this.profileService.paymentReceipt(payment.id)),
      );
      this.receiptOpen.set(true);
    } catch {
      this.receiptError.set('دریافت رسید ناموفق بود؛ دوباره تلاش کنید');
    } finally {
      this.receiptLoading.set(null);
    }
  }

  protected onReceiptState(state: string): void {
    this.receiptOpen.set(state === 'open');
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.payments.set(await firstValueFrom(this.profileService.payments()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly when = jalaliTime;
}
