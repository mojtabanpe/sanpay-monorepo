import { randomUUID } from 'node:crypto';
import {
  GatewayCallback,
  GatewayCreateInput,
  GatewayCreated,
  GatewayInquiry,
  GatewayPaymentRef,
  GatewayRefundRef,
  GatewayRefundResult,
  GatewayVerified,
  PaymentGateway,
} from './payment-gateway';

/**
 * درگاه آزمایشی: یک صفحهٔ ساده با دو دکمهٔ «پرداخت موفق / ناموفق» که API خودش
 * سرو می‌کند (`GET /api/upg/mock-gateway/:ref`)، تا بدون ترمینال واقعی و
 * اینترنت ایران هم هر سه حالت UPG قابل آزمایش باشد.
 *
 * برخلاف درگاه واقعی، نتیجه را از خود callback می‌خواند — یعنی هر کسی
 * می‌تواند پرداخت را «موفق» اعلام کند. هرگز در production فعالش نکنید.
 */
export class MockGateway implements PaymentGateway {
  readonly key = 'mock';
  readonly label = 'درگاه آزمایشی';
  readonly capabilities = { refund: true, partialRefund: true };

  async create(input: GatewayCreateInput): Promise<GatewayCreated> {
    const ref = randomUUID();
    const params = new URLSearchParams({
      tracker_id: input.trackerId,
      amount: String(input.amountRial),
      callback: input.callbackUrl,
    });
    return {
      ref,
      redirectUrl: `${new URL(input.callbackUrl).origin}/api/upg/mock-gateway/${ref}?${params}`,
    };
  }

  parseCallback(body: Record<string, unknown>): GatewayCallback {
    return {
      trackerId: String(body['tracker_id'] ?? ''),
      ref: typeof body['uuid'] === 'string' ? body['uuid'] : null,
      raw: body,
    };
  }

  async verify(
    payment: GatewayPaymentRef,
    callback: GatewayCallback | null,
  ): Promise<GatewayVerified> {
    const ok = callback?.raw['status'] === 'success';
    return {
      ok,
      amountRial: ok ? payment.amountRial : null,
      psp: 'MOCK',
      terminal: '00000000',
      traceNumber: ok
        ? String(Math.floor(100000 + Math.random() * 900000))
        : null,
      referenceNumber: ok ? String(Date.now()) : null,
      maskedCard: ok ? '6037-99**-****-1234' : null,
      error: ok ? null : 'پرداخت در درگاه آزمایشی لغو شد',
    };
  }

  /**
   * درگاه آزمایشی حافظه ندارد: تا ۳۰ دقیقه «در انتظار» و بعد «منقضی»، مثل
   * پرداخت رهاشده در تومان.
   */
  async inquire(payment: GatewayPaymentRef): Promise<GatewayInquiry> {
    return Date.now() - payment.createdAt.getTime() > 30 * 60_000
      ? { state: 'expired', error: 'مهلت پرداخت در درگاه آزمایشی تمام شد' }
      : { state: 'pending' };
  }

  async refund(refund: GatewayRefundRef): Promise<GatewayRefundResult> {
    return { state: 'pending', ref: `mock-refund-${refund.trackerId}` };
  }

  /** نتیجهٔ نهایی با `UPG_MOCK_REFUND_RESULT` — برای آزمودن مسیر شکست */
  async refundStatus(refund: GatewayRefundRef): Promise<GatewayRefundResult> {
    return mockRefundOutcome(refund.ref);
  }
}

/**
 * نتیجهٔ بازگشت پول در درگاه‌های آزمایشی: `success` (پیش‌فرض)، `failed`،
 * `denied` یا `unknown` (تا ابد در جریان).
 */
export function mockRefundOutcome(ref: string | null): GatewayRefundResult {
  switch ((process.env.UPG_MOCK_REFUND_RESULT || 'success').toLowerCase()) {
    case 'failed':
      return { state: 'failed', ref, error: 'بازگشت آزمایشی ناموفق' };
    case 'denied':
      return { state: 'denied', ref, error: 'موجودی کیف پول refund کافی نیست' };
    case 'unknown':
      return { state: 'pending', unknown: true, ref };
    default:
      return { state: 'succeeded', ref };
  }
}
