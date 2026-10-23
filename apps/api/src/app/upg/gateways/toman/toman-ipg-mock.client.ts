import { randomUUID } from 'node:crypto';
import {
  TomanCreatePaymentBody,
  TomanIpgApi,
  TomanIpgError,
  TomanIpgPayment,
  TomanIpgRefund,
  TomanPaymentStatus,
  TomanRefundStatus,
  TomanRefundWallet,
} from './toman-ipg.types';

/**
 * ماندهٔ ثابت کیف پول بازگشت شبیه‌ساز (ریال) — با بازگشت‌ها کم نمی‌شود.
 * `UPG_MOCK_REFUND_WALLET_RIAL` برای دیدن هشدار «موجودی کم» داشبورد.
 */
const MOCK_REFUND_WALLET_RIAL = 100_000_000;

/** تومان پرداخت‌های غیرنهایی را بعد از ۳۰ دقیقه منقضی می‌کند */
const PAYMENT_TTL_MS = 30 * 60_000;

interface MockPayment extends TomanIpgPayment {
  callbackUrl: string;
  createdAtMs: number;
  /** جمع بازگشت‌های غیرناموفق (ریال) */
  refunded: number;
}

/**
 * شبیه‌ساز درون‌حافظه‌ای سرور IPG تومان، برای کار بدون ترمینال و اینترنت
 * ایران (`TOMAN_IPG_MODE` ≠ `live`). همان وضعیت‌ها و کدهای خطای مستند را
 * برمی‌گرداند تا منطق `TomanIpgGateway` واقعاً آزموده شود.
 *
 * صفحهٔ «بانک» را خود API سرو می‌کند (`GET /api/upg/mock-toman/:uuid`) و مثل
 * تومان، کاربر را با یک POST فرم (x-www-form-urlencoded) به callback برمی‌گرداند.
 *
 * حالت با ری‌استارت API پاک می‌شود. نتیجهٔ بازگشت پول با
 * `UPG_MOCK_REFUND_RESULT` (success | failed | denied | unknown) تعیین می‌شود.
 */
export class TomanIpgMockClient implements TomanIpgApi {
  readonly live = false;
  private readonly payments = new Map<string, MockPayment>();
  private readonly refunds = new Map<string, TomanIpgRefund>();

  async createPayment(body: TomanCreatePaymentBody) {
    if (!Number.isSafeInteger(body.amount) || body.amount < 1_000) {
      throw new TomanIpgError(400, ['min_value'], ['amount']);
    }
    const uuid = randomUUID();
    this.payments.set(uuid, {
      uuid,
      amount: body.amount,
      status: TomanPaymentStatus.TOKEN_ACQUIRED,
      tracker_id: body.tracker_id,
      psp: 'MOCK',
      terminal_number: '13268913',
      created_at: new Date().toISOString(),
      callbackUrl: body.callback_url,
      createdAtMs: Date.now(),
      refunded: 0,
    });
    return { uuid, tracker_id: body.tracker_id };
  }

  redirectUrl(uuid: string, callbackUrl: string): string {
    return `${new URL(callbackUrl).origin}/api/upg/mock-toman/${uuid}`;
  }

  async verifyPayment(uuid: string): Promise<TomanIpgPayment> {
    const payment = this.find(uuid);
    if (payment.status === TomanPaymentStatus.FAILED) {
      throw new TomanIpgError(400, ['psp_verify_rejected']);
    }
    if (payment.status !== TomanPaymentStatus.CALLED_BACK) {
      throw new TomanIpgError(400, ['status_change_not_allowed']);
    }
    payment.status = TomanPaymentStatus.VERIFIED;
    payment.verified_at = new Date().toISOString();
    return this.view(payment);
  }

  async getPayment(uuid: string): Promise<TomanIpgPayment> {
    return this.view(this.find(uuid));
  }

  async createRefund(
    paymentUuid: string,
    body: { amount: number; tracker_id: string },
  ): Promise<TomanIpgRefund> {
    const payment = this.payments.get(paymentUuid);
    if (!payment) throw new TomanIpgError(400, ['payment_not_found']);
    if (payment.status !== TomanPaymentStatus.VERIFIED) {
      throw new TomanIpgError(400, ['refund_not_allowed']);
    }
    if (
      [...this.refunds.values()].some((r) => r.tracker_id === body.tracker_id)
    ) {
      throw new TomanIpgError(400, ['unique'], ['tracker_id']);
    }
    if (body.amount <= 0 || body.amount > payment.amount - payment.refunded) {
      throw new TomanIpgError(400, ['invalid_refund_amount']);
    }
    payment.refunded += body.amount;
    const refund: TomanIpgRefund = {
      uuid: randomUUID(),
      payment: paymentUuid,
      status: TomanRefundStatus.PENDING,
      amount: body.amount,
      tracker_id: body.tracker_id,
      created_at: new Date().toISOString(),
    };
    this.refunds.set(refund.uuid, refund);
    return { ...refund };
  }

  /** بازگشت در جریان، در اولین استعلام به نتیجهٔ `UPG_MOCK_REFUND_RESULT` می‌رسد */
  async getRefundByTracker(trackerId: string): Promise<TomanIpgRefund> {
    const refund = [...this.refunds.values()].find(
      (r) => r.tracker_id === trackerId,
    );
    if (!refund) throw new TomanIpgError(404, ['refund_not_found']);
    if (refund.status === TomanRefundStatus.PENDING) {
      refund.status = mockRefundStatus();
      if (
        refund.status === TomanRefundStatus.FAILED ||
        refund.status === TomanRefundStatus.DENIED
      ) {
        const payment = this.payments.get(refund.payment);
        if (payment) payment.refunded -= refund.amount;
        refund.error_detail =
          refund.status === TomanRefundStatus.DENIED
            ? 'Out of Credit'
            : 'Card is not active';
      }
    }
    return { ...refund };
  }

  async getRefundWallet(): Promise<TomanRefundWallet> {
    const configured = Number(process.env.UPG_MOCK_REFUND_WALLET_RIAL);
    return {
      balance:
        Number.isSafeInteger(configured) && configured >= 0
          ? configured
          : MOCK_REFUND_WALLET_RIAL,
      address: 'ipgrw-mock',
    };
  }

  // ─── صفحهٔ بانک آزمایشی ──────────────────────────────────────────────────

  /** برای صفحهٔ بانک: مبلغ، یا null اگر پرداخت وجود ندارد/دیگر باز نیست */
  open(uuid: string): { amount: number } | null {
    const payment = this.payments.get(uuid);
    if (!payment) return null;
    this.expire(payment);
    if (
      payment.status !== TomanPaymentStatus.TOKEN_ACQUIRED &&
      payment.status !== TomanPaymentStatus.REDIRECTED
    ) {
      return null;
    }
    payment.status = TomanPaymentStatus.REDIRECTED;
    return { amount: payment.amount };
  }

  /**
   * کاربر در صفحهٔ بانک «پرداخت» یا «انصراف» زد. همان فیلدهایی را می‌دهد
   * که تومان به callback پست می‌کند.
   */
  complete(
    uuid: string,
    outcome: 'success' | 'failed',
  ): { callbackUrl: string; fields: Record<string, string> } | null {
    const payment = this.payments.get(uuid);
    if (!payment || payment.status !== TomanPaymentStatus.REDIRECTED) {
      return null;
    }
    if (outcome === 'success') {
      payment.status = TomanPaymentStatus.CALLED_BACK;
      payment.trace_number = String(
        Math.floor(100000 + Math.random() * 900000),
      );
      payment.reference_number = String(Date.now());
      payment.digital_receipt_number = randomUUID().replace(/-/g, '');
      payment.masked_paid_card_number = '603799******1234';
    } else {
      payment.status = TomanPaymentStatus.FAILED;
      payment.error_detail = 'Canceled by user';
    }
    const fields: Record<string, string> = {
      uuid: payment.uuid,
      amount: String(payment.amount),
      tracker_id: payment.tracker_id ?? '',
      psp: payment.psp ?? '',
      terminal: String(payment.terminal_number ?? ''),
      trace_number: String(payment.trace_number ?? ''),
      reference_number: String(payment.reference_number ?? ''),
      digital_receipt_number: payment.digital_receipt_number ?? '',
      status: String(payment.status),
      error_detail: payment.error_detail ?? '',
    };
    return { callbackUrl: payment.callbackUrl, fields };
  }

  private find(uuid: string): MockPayment {
    const payment = this.payments.get(uuid);
    if (!payment) throw new TomanIpgError(404, ['http_404_not_found']);
    this.expire(payment);
    return payment;
  }

  private expire(payment: MockPayment): void {
    const final = [
      TomanPaymentStatus.VERIFIED,
      TomanPaymentStatus.REVERTED,
      TomanPaymentStatus.FAILED,
      TomanPaymentStatus.EXPIRED,
      TomanPaymentStatus.UNKNOWN,
    ] as number[];
    if (
      !final.includes(payment.status) &&
      Date.now() - payment.createdAtMs > PAYMENT_TTL_MS
    ) {
      payment.status = TomanPaymentStatus.EXPIRED;
    }
  }

  private view(payment: MockPayment): TomanIpgPayment {
    const { callbackUrl, createdAtMs, refunded, ...view } = payment;
    void callbackUrl;
    void createdAtMs;
    void refunded;
    return { ...view, terminal: view.terminal_number };
  }
}

function mockRefundStatus(): number {
  switch ((process.env.UPG_MOCK_REFUND_RESULT || 'success').toLowerCase()) {
    case 'failed':
      return TomanRefundStatus.FAILED;
    case 'denied':
      return TomanRefundStatus.DENIED;
    case 'unknown':
      return TomanRefundStatus.UNKNOWN;
    default:
      return TomanRefundStatus.SUCCESSFUL;
  }
}
