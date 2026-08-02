import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Receipt } from '@sanpay/models';
import { ReceiptCard } from '@sanpay/receipt';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { StorePaymentsService } from '../../core/payments.service';
import { StoreAuthService } from '../../core/store-auth.service';

@Component({
  selector: 'store-payments',
  imports: [HlmButtonImports, HlmSkeletonImports, ReceiptCard],
  templateUrl: './payments.html',
})
export class PaymentsPage implements OnDestroy {
  private readonly payments = inject(StorePaymentsService);
  private readonly auth = inject(StoreAuthService);
  private readonly router = inject(Router);

  private stopStream: (() => void) | null = null;

  protected readonly store = this.auth.profile;
  protected readonly receipts = signal<Receipt[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly live = signal(false);
  /** رسیدی که همین الان رسیده — برای برجسته‌کردن در لیست */
  protected readonly justArrived = signal<string | null>(null);

  protected readonly todayTotal = computed(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.receipts()
      .filter((receipt) => new Date(receipt.createdAt) >= startOfDay)
      .reduce((sum, receipt) => sum + receipt.amount, 0);
  });

  protected readonly todayCount = computed(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.receipts().filter(
      (receipt) => new Date(receipt.createdAt) >= startOfDay,
    ).length;
  });

  private readonly faNumber = new Intl.NumberFormat('fa-IR');

  constructor() {
    void this.load();
    this.stopStream = this.payments.stream(
      (receipt) => this.onNewReceipt(receipt),
      (connected) => this.onConnectionChange(connected),
    );
  }

  ngOnDestroy(): void {
    this.stopStream?.();
    this.stopStream = null;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.receipts.set(await this.payments.recent());
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * پرداخت‌هایی که هنگام قطعی اتصال ثبت شده‌اند از استریم نمی‌آیند، پس بعد از
   * هر وصل‌شدن دوباره لیست را از سرور می‌گیریم.
   */
  private onConnectionChange(connected: boolean): void {
    const reconnected = connected && !this.live() && !this.loading();
    this.live.set(connected);
    if (reconnected) void this.load();
  }

  private onNewReceipt(receipt: Receipt): void {
    // ممکن است همان رسید هم از استریم و هم از بارگذاری اولیه بیاید
    this.receipts.update((current) =>
      current.some((existing) => existing.id === receipt.id)
        ? current
        : [receipt, ...current],
    );
    this.justArrived.set(receipt.id);
    setTimeout(() => {
      if (this.justArrived() === receipt.id) this.justArrived.set(null);
    }, 8_000);
  }

  protected logout(): void {
    this.stopStream?.();
    this.stopStream = null;
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  protected toman(value: number): string {
    return `${this.faNumber.format(value)} تومان`;
  }

  protected count(value: number): string {
    return this.faNumber.format(value);
  }
}
