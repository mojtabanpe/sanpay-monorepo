import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  AdminGatewayPaymentRow,
  AdminGatewayRefundRow,
  AdminRefundWallet,
  AdminUpgReviewQueue,
} from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmTableImports } from '@sanpay/ui/table';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import {
  GATEWAY_REFUND_STATUS_LABELS,
  INTENT_PURPOSE_LABELS,
  fa,
  gatewayStatusVariant,
  jalaliTime,
  toman,
} from '../../core/format';
import { UpgQueueCount } from '../../core/upg-queue-count';
import { UpgReviewActions } from '../../core/upg-review';

/**
 * صف بررسی دستی UPG: پرداخت‌های نامعلوم و بازگشت‌های گیرکرده — چیزهایی که
 * هیچ cronی خودکار تکلیفشان را روشن نمی‌کند. هشدار کیف پول بازگشت کم هم
 * این‌جاست، چون DENIED شدن بازگشت‌ها از همان‌جا می‌آید.
 */
@Component({
  selector: 'app-upg-review',
  imports: [
    RouterModule,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmTableImports,
  ],
  templateUrl: './upg-review.html',
})
export class UpgReviewPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);
  private readonly actions = inject(UpgReviewActions);
  private readonly queueCount = inject(UpgQueueCount);

  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly jalaliTime = jalaliTime;
  protected readonly variant = gatewayStatusVariant;
  protected readonly refundLabels = GATEWAY_REFUND_STATUS_LABELS;
  protected readonly purposeLabels = INTENT_PURPOSE_LABELS;
  protected readonly canWrite = this.auth.canWrite;

  protected readonly queue = signal<AdminUpgReviewQueue | null>(null);
  protected readonly wallets = signal<AdminRefundWallet[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly lowWallets = computed(() =>
    this.wallets().filter((wallet) => wallet.enabled && wallet.low),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [queue, wallets] = await Promise.all([
        this.api.upgReviewQueue(),
        // هشدار جانبی است؛ خطایش نباید صف را خالی نشان دهد
        this.api.refundWallets().catch(() => []),
      ]);
      this.queue.set(queue);
      this.wallets.set(wallets);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن صف بررسی ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected reviewPayment(
    payment: AdminGatewayPaymentRow,
    outcome: 'verified' | 'failed',
  ): Promise<void> {
    return this.run(
      () => this.actions.payment(payment, outcome),
      outcome === 'verified'
        ? `پرداخت ${payment.employee.name} تأیید شد.`
        : `پرداخت ${payment.employee.name} ناموفق اعلام شد.`,
    );
  }

  protected reviewRefund(
    refund: AdminGatewayRefundRow,
    outcome: 'succeeded' | 'failed',
  ): Promise<void> {
    return this.run(
      () => this.actions.refund(refund, outcome),
      outcome === 'succeeded'
        ? `بازگشت ${refund.employee.name} موفق بسته شد.`
        : `بازگشت ${refund.employee.name} ناموفق اعلام شد و مبلغ به مانده برگشت.`,
    );
  }

  private async run(
    action: () => Promise<unknown>,
    done: string,
  ): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      if ((await action()) === null) return;
      this.notice.set(done);
      void this.queueCount.refresh();
      await this.load();
    } catch (caught) {
      this.error.set(apiError(caught, 'ثبت تصمیم ممکن نشد'));
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }
}
