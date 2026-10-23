import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { SanpayAmountInput } from '@sanpay/forms';
import { CardRefundItem, CardRefundSummary } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';
import { jalaliTime, toman } from '../format';

const OPEN = new Set(['SUBMITTING', 'PENDING', 'UNKNOWN']);
const RECENT = 3;

/**
 * «بازگشت پول» — ماندهٔ پرداخت‌های کارتی قبلی (مثلاً خریدی که لغو شد) به همان
 * کارت برمی‌گردد. فقط وقتی دیده می‌شود که مانده‌ای هست یا بازگشتی در جریان
 * است. این مانده عمداً «کیف پول» نامیده نمی‌شود: کارمند نه شارژش می‌کند و نه
 * از آن خرید می‌کند — پول خودش است که منتظر برگشتن است.
 */
@Component({
  selector: 'profile-card-refund',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmSheetImports,
    SanpayAmountInput,
  ],
  templateUrl: './card-refund.html',
})
export class CardRefundCard {
  private readonly profileService = inject(ProfileService);

  protected readonly summary = signal<CardRefundSummary | null>(null);
  protected readonly sheetOpen = signal(false);
  /** مبلغ ورودی به ریال، ارقام لاتین بدون جداکننده */
  protected readonly rial = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly visible = computed(() => {
    const summary = this.summary();
    return (
      !!summary &&
      (summary.balance > 0 ||
        summary.refunds.some((refund) => OPEN.has(refund.status)))
    );
  });
  protected readonly recent = computed(
    () => this.summary()?.refunds.slice(0, RECENT) ?? [],
  );
  protected readonly amount = computed(() => Number(this.rial() || 0) / 10);
  protected readonly invalid = computed(() => {
    const summary = this.summary();
    const amount = this.amount();
    if (!summary || amount <= 0) return null;
    if (!Number.isInteger(amount)) return 'مبلغ باید مضربی از ۱۰ ریال باشد.';
    if (amount > summary.refundable)
      return 'مبلغ از ماندهٔ قابل بازگشت بیشتر است.';
    if (amount < summary.minimum && amount !== summary.refundable)
      return `کمترین مبلغ بازگشت ${toman(summary.minimum)} است، مگر کل مانده کمتر باشد.`;
    return null;
  });
  protected readonly canSubmit = computed(
    () => this.amount() > 0 && !this.invalid() && !this.busy(),
  );

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.summary.set(await firstValueFrom(this.profileService.cardRefunds()));
    } catch {
      // نبودِ این کارت چیزی را خراب نمی‌کند؛ بقیهٔ پروفایل کار می‌کند
      this.summary.set(null);
    }
  }

  protected open(): void {
    const refundable = this.summary()?.refundable ?? 0;
    this.rial.set(refundable > 0 ? String(refundable * 10) : '');
    this.error.set(null);
    this.sheetOpen.set(true);
  }

  protected fillAll(): void {
    this.rial.set(String((this.summary()?.refundable ?? 0) * 10));
  }

  protected onSheetState(state: string): void {
    if (state === 'closed' && !this.busy()) this.sheetOpen.set(false);
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.summary.set(
        await firstValueFrom(
          this.profileService.requestCardRefund(this.amount()),
        ),
      );
      this.sheetOpen.set(false);
    } catch (caught) {
      this.error.set(serverMessage(caught));
      void this.load();
    } finally {
      this.busy.set(false);
    }
  }

  protected statusLabel(refund: CardRefundItem): string {
    switch (refund.status) {
      case 'SUCCEEDED':
        return 'واریز شد';
      case 'FAILED':
      case 'DENIED':
        return 'ناموفق — به مانده برگشت';
      case 'UNKNOWN':
        return 'در حال بررسی';
      default:
        return 'در جریان';
    }
  }

  protected statusColor(refund: CardRefundItem): string {
    switch (refund.status) {
      case 'SUCCEEDED':
        return 'var(--pos-fg)';
      case 'FAILED':
      case 'DENIED':
        return 'var(--neg-fg)';
      default:
        return 'var(--warn-fg)';
    }
  }

  protected readonly toman = toman;
  protected readonly jalaliTime = jalaliTime;
}

function serverMessage(caught: unknown): string {
  const error = caught as HttpErrorResponse;
  const message = error?.error?.message;
  if (typeof message === 'string' && error.status < 500) return message;
  if (Array.isArray(message) && typeof message[0] === 'string')
    return message[0];
  return 'ثبت درخواست بازگشت ناموفق بود؛ کمی بعد دوباره تلاش کنید';
}
