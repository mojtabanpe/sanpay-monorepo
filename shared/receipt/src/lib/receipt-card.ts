import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Receipt } from '@sanpay/models';

/**
 * رسید پرداخت — همان نمایی که کارمند بعد از پرداخت به فروشنده نشان می‌دهد و در
 * پنل فروشگاه هم دیده می‌شود.
 *
 * - `variant="employee"`: ماندهٔ کیف پول بعد از پرداخت هم نمایش داده می‌شود.
 * - `variant="store"`: نمای فروشنده؛ ماندهٔ کیف پول کارمند نمایش داده نمی‌شود
 *   (سرور هم آن را ارسال نمی‌کند).
 */
@Component({
  selector: 'sanpay-receipt-card',
  templateUrl: './receipt-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptCard {
  readonly receipt = input.required<Receipt>();
  readonly variant = input<'employee' | 'store'>('employee');
  /** نمایش فشرده برای لیست پنل فروشگاه */
  readonly compact = input(false);

  private readonly faNumber = new Intl.NumberFormat('fa-IR');
  private readonly faDate = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  private readonly faTime = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  protected readonly paidAt = computed(() => new Date(this.receipt().createdAt));
  /** وقتی مبلغ از یک کیف پول کسر شده، تفکیک اضافه است */
  protected readonly isSplit = computed(() => this.receipt().lines.length > 1);

  protected toman(value: number): string {
    return `${this.faNumber.format(value)} تومان`;
  }

  protected date(value: Date): string {
    return this.faDate.format(value);
  }

  protected time(value: Date): string {
    return this.faTime.format(value);
  }

  /** شمارهٔ رسید ۸ رقمی را به‌صورت ۴+۴ می‌شکند تا خواندنش برای فروشنده ساده باشد */
  protected groupedReceiptNo(): string {
    const receiptNo = this.receipt().receiptNo;
    return receiptNo.length === 8
      ? `${receiptNo.slice(0, 4)} ${receiptNo.slice(4)}`
      : receiptNo;
  }
}
