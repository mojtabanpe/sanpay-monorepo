import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  AdminGatewayPaymentDetail,
  AdminGatewayRefundRow,
  AdminUpgInquiry,
} from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmTableImports } from '@sanpay/ui/table';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import {
  GATEWAY_PAYMENT_STATUS_LABELS,
  GATEWAY_REFUND_STATUS_LABELS,
  GATEWAY_REVIEW_ACTION_LABELS,
  INTENT_PURPOSE_LABELS,
  INTENT_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  gatewayStatusVariant,
  jalaliTime,
  toman,
} from '../../core/format';
import { UpgQueueCount } from '../../core/upg-queue-count';
import { UpgReviewActions } from '../../core/upg-review';

/** بازگشت‌هایی که هنوز خودکار پیگیری می‌شوند و دستی هم قابل بستن‌اند */
const OPEN_REFUNDS = ['SUBMITTING', 'PENDING', 'UNKNOWN'];

/**
 * جزئیات یک پرداخت درگاه: پاسخ خام و خطا، intent و تلاش‌های دیگرش،
 * بازگشت‌ها به کارت، گردش کیف پول و یادداشت‌های بررسی دستی.
 */
@Component({
  selector: 'app-gateway-payment',
  imports: [
    RouterModule,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmTableImports,
  ],
  templateUrl: './gateway-payment.html',
})
export class GatewayPaymentPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);
  private readonly actions = inject(UpgReviewActions);
  private readonly queueCount = inject(UpgQueueCount);

  /** از پارامتر مسیر (`withComponentInputBinding`) */
  readonly id = input.required<string>();

  protected readonly toman = toman;
  protected readonly jalaliTime = jalaliTime;
  protected readonly variant = gatewayStatusVariant;
  protected readonly paymentLabels = GATEWAY_PAYMENT_STATUS_LABELS;
  protected readonly refundLabels = GATEWAY_REFUND_STATUS_LABELS;
  protected readonly reviewLabels = GATEWAY_REVIEW_ACTION_LABELS;
  protected readonly intentLabels = INTENT_STATUS_LABELS;
  protected readonly purposeLabels = INTENT_PURPOSE_LABELS;
  protected readonly transactionLabels = TRANSACTION_TYPE_LABELS;
  protected readonly canWrite = this.auth.canWrite;

  protected readonly payment = signal<AdminGatewayPaymentDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  /** آخرین استعلام زنده — برای پرداخت (`payment`) یا یک بازگشت (شناسه‌اش) */
  protected readonly inquiry = signal<{
    target: string;
    result: AdminUpgInquiry;
  } | null>(null);

  protected readonly rawJson = computed(() => json(this.payment()?.raw));
  protected readonly inquiryJson = computed(() =>
    json(this.inquiry()?.result.raw),
  );

  constructor() {
    // لینک «تلاش‌های دیگر» همین کامپوننت را با شناسهٔ تازه نگه می‌دارد
    effect(() => {
      this.id();
      untracked(() => {
        this.inquiry.set(null);
        this.notice.set(null);
        void this.load();
      });
    });
  }

  protected isOpen(refund: AdminGatewayRefundRow): boolean {
    return OPEN_REFUNDS.includes(refund.status);
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.payment.set(await this.api.gatewayPayment(this.id()));
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن پرداخت ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected inquirePayment(): Promise<void> {
    return this.run(async () => {
      const result = await this.api.inquireGatewayPayment(this.id());
      this.inquiry.set({ target: 'payment', result });
    }, 'استعلام از درگاه ممکن نشد');
  }

  protected inquireRefund(refund: AdminGatewayRefundRow): Promise<void> {
    return this.run(async () => {
      const result = await this.api.inquireGatewayRefund(refund.id);
      this.inquiry.set({ target: refund.id, result });
    }, 'استعلام بازگشت ممکن نشد');
  }

  protected reviewPayment(outcome: 'verified' | 'failed'): Promise<void> {
    const payment = this.payment();
    if (!payment) return Promise.resolve();
    return this.run(async () => {
      const updated = await this.actions.payment(payment, outcome);
      if (!updated) return;
      this.payment.set(updated);
      this.inquiry.set(null);
      void this.queueCount.refresh();
      this.notice.set(
        outcome === 'verified'
          ? 'پرداخت تأیید شد و مبلغ به ماندهٔ کارتی کارمند واریز شد.'
          : 'پرداخت ناموفق اعلام شد.',
      );
    }, 'ثبت تصمیم ممکن نشد');
  }

  protected reviewRefund(
    refund: AdminGatewayRefundRow,
    outcome: 'succeeded' | 'failed',
  ): Promise<void> {
    return this.run(async () => {
      const updated = await this.actions.refund(refund, outcome);
      if (!updated) return;
      this.payment.set(updated);
      this.inquiry.set(null);
      void this.queueCount.refresh();
      this.notice.set(
        outcome === 'succeeded'
          ? 'بازگشت «موفق» بسته شد.'
          : 'بازگشت ناموفق اعلام شد و مبلغ به ماندهٔ کارمند برگشت.',
      );
    }, 'ثبت تصمیم ممکن نشد');
  }

  private async run(
    action: () => Promise<void>,
    fallback: string,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (caught) {
      this.error.set(apiError(caught, fallback));
    } finally {
      this.busy.set(false);
    }
  }
}

function json(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : JSON.stringify(value, null, 2);
}
