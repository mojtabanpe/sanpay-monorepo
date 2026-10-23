import { SanpayAmountInput } from '@sanpay/forms';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Receipt } from '@sanpay/models';
import { ReceiptCard } from '@sanpay/receipt';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSpinnerImports } from '@sanpay/ui/spinner';
import { StorePaymentsService } from '../../core/payments.service';

@Component({
  selector: 'store-merchant-payment',
  imports: [
    SanpayAmountInput,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSpinnerImports,
    ReceiptCard,
  ],
  templateUrl: './merchant-payment.html',
})
export class MerchantPayment implements OnDestroy {
  private readonly payments = inject(StorePaymentsService);

  protected readonly step = signal<'details' | 'otp' | 'awaiting' | 'done'>(
    'details',
  );
  /** وقتی اعتبار کافی نبود: سهم اعتبار و سهمی که کارمند با کارت می‌دهد */
  protected readonly split = signal<{ credit: number; card: number } | null>(
    null,
  );
  private stopStream: (() => void) | null = null;
  protected readonly nationalCode = signal('');
  protected readonly phone = signal('');
  protected readonly amount = signal('');
  protected readonly code = signal('');
  protected readonly intentId = signal<string | null>(null);
  protected readonly receipt = signal<Receipt | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected set(
    field: 'nationalCode' | 'phone' | 'amount' | 'code',
    value: string,
  ): void {
    this[field].set(
      value
        .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
        .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
        .replace(/[^0-9]/g, ''),
    );
    this.error.set(null);
  }

  protected async requestOtp(): Promise<void> {
    const amount = Number(this.amount()) / 10;
    if (
      !/^\d{10}$/.test(this.nationalCode()) ||
      !/^09\d{9}$/.test(this.phone())
    ) {
      this.error.set('کد ملی و شماره موبایل را کامل وارد کنید');
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      this.error.set('مبلغ ریالی معتبر (مضرب ۱۰) وارد کنید');
      return;
    }
    await this.run(async () => {
      const result = await this.payments.requestMerchantPayment({
        nationalCode: this.nationalCode(),
        phone: this.phone(),
        amount,
        idempotencyKey: crypto.randomUUID(),
      });
      this.intentId.set(result.intentId);
      this.step.set('otp');
    });
  }

  protected async verify(): Promise<void> {
    const intentId = this.intentId();
    if (!intentId || !/^\d{6}$/.test(this.code())) {
      this.error.set('کد شش‌رقمی را کامل وارد کنید');
      return;
    }
    await this.run(async () => {
      const result = await this.payments.verifyMerchantPayment({
        intentId,
        code: this.code(),
      });
      if (result.status === 'COMPLETED') {
        this.receipt.set(result.receipt);
        this.step.set('done');
        return;
      }
      // اعتبار کافی نبود: لینک پرداخت کارتی برای کارمند پیامک شد. رسید بعد از
      // پرداخت او از جریان زندهٔ فروش‌ها می‌رسد و همین‌جا نشان داده می‌شود.
      this.split.set({ credit: result.creditAmount, card: result.cardAmount });
      this.step.set('awaiting');
      this.waitForReceipt(intentId);
    });
  }

  private waitForReceipt(intentId: string): void {
    this.stopStream?.();
    this.stopStream = this.payments.stream((receipt) => {
      if (receipt.merchantIntentId !== intentId) return;
      this.receipt.set(receipt);
      this.step.set('done');
      this.stopStream?.();
      this.stopStream = null;
    });
  }

  ngOnDestroy(): void {
    this.stopStream?.();
  }

  protected rial(toman: number): string {
    return `${new Intl.NumberFormat('fa-IR').format(toman * 10)} ریال`;
  }

  protected reset(): void {
    this.stopStream?.();
    this.stopStream = null;
    this.split.set(null);
    this.step.set('details');
    this.nationalCode.set('');
    this.phone.set('');
    this.amount.set('');
    this.code.set('');
    this.intentId.set(null);
    this.receipt.set(null);
    this.error.set(null);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (caught) {
      const value = (caught as { error?: { message?: unknown } })?.error
        ?.message;
      this.error.set(
        typeof value === 'string' ? value : 'انجام عملیات ممکن نشد',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
