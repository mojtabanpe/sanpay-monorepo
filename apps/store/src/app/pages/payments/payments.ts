import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Receipt, StoreStats } from '@sanpay/models';
import { ReceiptCard } from '@sanpay/receipt';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { StorePaymentsService } from '../../core/payments.service';

@Component({
  selector: 'store-payments',
  imports: [
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
    ReceiptCard,
  ],
  templateUrl: './payments.html',
})
export class PaymentsPage implements OnDestroy {
  private readonly payments = inject(StorePaymentsService);

  private stopStream: (() => void) | null = null;

  protected readonly receipts = signal<Receipt[]>([]);
  protected readonly stats = signal<StoreStats | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly live = signal(false);
  /** رسیدی که همین الان رسیده — برای برجسته‌کردن در لیست */
  protected readonly justArrived = signal<string | null>(null);

  /**
   * بیشترین فروش روزانه در سری — مقیاسِ نمودار میله‌ای.
   * حداقل ۱ تا در هفتهٔ بدون فروش، تقسیم بر صفر رخ ندهد.
   */
  protected readonly seriesMax = computed(() =>
    Math.max(1, ...(this.stats()?.series ?? []).map((point) => point.total)),
  );

  private readonly faNumber = new Intl.NumberFormat('fa-IR');
  private readonly faWeekday = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'narrow',
  });
  /** برای جدولِ فقط-صفحه‌خوان: تاریخ جلالی خوانا، نه ISO میلادی */
  private readonly faFullDate = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

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
      const [receipts, stats] = await Promise.all([
        this.payments.recent(),
        this.payments.stats(),
      ]);
      this.receipts.set(receipts);
      this.stats.set(stats);
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

    this.applyToStats(receipt);
  }

  /**
   * آمار را با رسیدِ تازه جلو می‌برد.
   *
   * بدون این، «فروش امروز» تا بارگذاری بعدی روی عدد قدیمی می‌ماند — درست وقتی
   * فروشنده به صفحه نگاه می‌کند و انتظار دارد خریدی که همین الان انجام شد را
   * ببیند. رقم دقیق در `load()` بعدی از سرور تأیید می‌شود.
   */
  private applyToStats(receipt: Receipt): void {
    this.stats.update((current) => {
      if (!current) return current;
      const key = tehranDayKey(new Date(receipt.createdAt));
      return {
        ...current,
        today: {
          total: current.today.total + receipt.amount,
          count: current.today.count + 1,
        },
        week: {
          total: current.week.total + receipt.amount,
          count: current.week.count + 1,
        },
        month: {
          total: current.month.total + receipt.amount,
          count: current.month.count + 1,
        },
        series: current.series.map((point) =>
          point.date === key
            ? { ...point, total: point.total + receipt.amount }
            : point,
        ),
      };
    });
  }

  /** ارتفاع میلهٔ نمودار بر حسب درصد — کف ۲٪ تا روز بدون فروش هم دیده شود */
  protected barHeight(total: number): string {
    return `${Math.max(2, Math.round((total / this.seriesMax()) * 100))}%`;
  }

  protected weekday(date: string): string {
    return this.faWeekday.format(new Date(`${date}T12:00:00+03:30`));
  }

  /**
   * ظهرِ تهران، نه نیمه‌شب: با نیمه‌شب، هر انحرافِ کوچکِ منطقهٔ زمانی تاریخ را
   * یک روز عقب یا جلو می‌بَرد.
   */
  protected fullDate(date: string): string {
    return this.faFullDate.format(new Date(`${date}T12:00:00+03:30`));
  }

  protected toman(value: number): string {
    return `${this.faNumber.format(value)} تومان`;
  }

  protected count(value: number): string {
    return this.faNumber.format(value);
  }
}

/** همان کلیدی که سرور برای سری روزانه می‌سازد — روزِ تهران، نه روزِ UTC */
function tehranDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
