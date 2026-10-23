import {
  GatewayCallback,
  GatewayCreateInput,
  GatewayCreated,
  GatewayInquiry,
  GatewayPaymentRef,
  GatewayRefundRef,
  GatewayRefundResult,
  GatewayUnavailableError,
  GatewayVerified,
  PaymentGateway,
} from '../payment-gateway';
import { TomanIpgHttpClient } from './toman-ipg-http.client';
import { TomanIpgMockClient } from './toman-ipg-mock.client';
import {
  TomanIpgApi,
  TomanIpgError,
  TomanIpgPayment,
  TomanIpgRefund,
  TomanPaymentStatus,
  TomanRefundStatus,
} from './toman-ipg.types';

/**
 * درگاه IPG تومان (docs/upg.md، docs.tomanpay.net/IPG).
 *
 * `TOMAN_IPG_MODE=live` کلاینت واقعی را انتخاب می‌کند؛ هر چیز دیگری (حتی خالی)
 * شبیه‌ساز درون‌حافظه‌ای — مثل `GDS_MODE`، تا یک `.env` نیمه‌کاره هرگز نیمه‌وصل نشود.
 *
 * قاعده‌ها:
 * - به callback اعتماد نمی‌شود؛ فقط uuid و tracker_id از آن خوانده می‌شود.
 * - هر جا verify نتیجهٔ مبهم داد (`status_change_not_allowed`، خطای PSP، timeout)،
 *   وضعیت واقعی با استعلام پرسیده می‌شود. اگر استعلام هم نرسید، پرداخت «در
 *   انتظار» می‌ماند تا cron استعلام تکلیفش را روشن کند — نه «نامعلوم» دائمی.
 * - فقط `Unknown` خود تومان (-3) «نامعلوم» است و دستی بررسی می‌شود.
 */
export class TomanIpgGateway implements PaymentGateway {
  readonly key = 'toman';
  readonly label = 'درگاه پرداخت تومان';
  readonly capabilities = { refund: true, partialRefund: true };

  constructor(
    readonly api: TomanIpgApi = process.env.TOMAN_IPG_MODE?.toLowerCase() ===
    'live'
      ? new TomanIpgHttpClient()
      : new TomanIpgMockClient(),
  ) {}

  get live(): boolean {
    return this.api.live;
  }

  /** شبیه‌ساز، برای صفحهٔ بانک آزمایشی — در حالت live تهی */
  get mock(): TomanIpgMockClient | null {
    return this.api instanceof TomanIpgMockClient ? this.api : null;
  }

  async create(input: GatewayCreateInput): Promise<GatewayCreated> {
    const terminal = process.env.TOMAN_IPG_TERMINAL?.trim();
    const mobile = normalizeMobile(input.mobile);
    try {
      const created = await this.api.createPayment({
        amount: input.amountRial,
        callback_url: input.callbackUrl,
        tracker_id: input.trackerId,
        ...(mobile ? { mobile_number: mobile } : {}),
        ...(terminal ? { options: { terminal_number: terminal } } : {}),
      });
      return {
        ref: created.uuid,
        redirectUrl: this.api.redirectUrl(created.uuid, input.callbackUrl),
        raw: created,
      };
    } catch (error) {
      // no_psp_available و مشابه‌ها — راهبرد priority سراغ درگاه بعدی می‌رود
      throw new GatewayUnavailableError(messageOf(error));
    }
  }

  parseCallback(body: Record<string, unknown>): GatewayCallback {
    return {
      trackerId: String(body['tracker_id'] ?? ''),
      ref: typeof body['uuid'] === 'string' ? body['uuid'] : null,
      raw: body,
    };
  }

  async verify(payment: GatewayPaymentRef): Promise<GatewayVerified> {
    try {
      const verified = await this.api.verifyPayment(payment.ref);
      if (verified.status === TomanPaymentStatus.VERIFIED) {
        return verifiedFrom(verified);
      }
    } catch (error) {
      if (
        error instanceof TomanIpgError &&
        error.has('psp_verify_rejected', 'tampered_payment_data')
      ) {
        return {
          ok: false,
          amountRial: null,
          error: 'پرداخت از سوی بانک تأیید نشد',
          raw: { codes: error.codes },
        };
      }
      // بقیهٔ خطاها مبهم‌اند — وضعیت واقعی را بپرس
    }

    let inquiry: GatewayInquiry;
    try {
      inquiry = await this.inquire(payment);
    } catch (error) {
      return {
        ok: false,
        amountRial: null,
        pending: true,
        error: messageOf(error),
      };
    }
    switch (inquiry.state) {
      case 'verified':
        return inquiry.verified as GatewayVerified;
      case 'failed':
      case 'expired':
        return {
          ok: false,
          amountRial: null,
          error: inquiry.error ?? 'پرداخت انجام نشد',
          raw: inquiry.raw,
        };
      case 'pending':
        return { ok: false, amountRial: null, pending: true, raw: inquiry.raw };
      // returned: کاربر برگشته ولی verify ما پذیرفته نشد؛ unknown: خود تومان نمی‌داند
      default:
        return {
          ok: false,
          amountRial: null,
          unknown: true,
          error:
            inquiry.state === 'unknown'
              ? 'وضعیت پرداخت نزد تومان نامعلوم است'
              : 'verify پذیرفته نشد و پرداخت هنوز منتظر تأیید است',
          raw: inquiry.raw,
        };
    }
  }

  /** خطای شبکه پرتاب می‌شود تا cron بعداً دوباره بپرسد */
  async inquire(payment: GatewayPaymentRef): Promise<GatewayInquiry> {
    const current = await this.api.getPayment(payment.ref);
    const raw = redact(current);
    switch (current.status) {
      case TomanPaymentStatus.VERIFIED:
        return { state: 'verified', verified: verifiedFrom(current), raw };
      case TomanPaymentStatus.CALLED_BACK:
        return { state: 'returned', raw };
      case TomanPaymentStatus.EXPIRED:
        return { state: 'expired', error: 'مهلت پرداخت در درگاه تمام شد', raw };
      case TomanPaymentStatus.FAILED:
      case TomanPaymentStatus.REVERTED:
        return {
          state: 'failed',
          error:
            current.status === TomanPaymentStatus.REVERTED
              ? 'پرداخت برگشت خورد'
              : 'پرداخت انجام نشد',
          raw,
        };
      case TomanPaymentStatus.UNKNOWN:
        return { state: 'unknown', raw };
      default:
        return { state: 'pending', raw };
    }
  }

  async refund(refund: GatewayRefundRef): Promise<GatewayRefundResult> {
    try {
      const created = await this.api.createRefund(refund.payment.ref, {
        amount: refund.amountRial,
        tracker_id: refund.trackerId,
      });
      return refundResult(created);
    } catch (error) {
      if (!(error instanceof TomanIpgError) || !error.rejected) {
        return { state: 'unreachable', error: messageOf(error) };
      }
      // tracker تکراری یعنی تلاش قبلی ثبت شده بود و فقط پاسخش گم شد
      if (error.fields.includes('tracker_id')) {
        return { state: 'unreachable', error: messageOf(error) };
      }
      return {
        state: error.has('not_enough_balance') ? 'denied' : 'failed',
        error: refundErrorMessage(error),
        raw: { codes: error.codes },
      };
    }
  }

  async refundStatus(refund: GatewayRefundRef): Promise<GatewayRefundResult> {
    try {
      return refundResult(await this.api.getRefundByTracker(refund.trackerId));
    } catch (error) {
      if (
        error instanceof TomanIpgError &&
        (error.has('refund_not_found') || error.status === 404)
      ) {
        return { state: 'missing' };
      }
      return { state: 'unreachable', error: messageOf(error) };
    }
  }
}

function verifiedFrom(payment: TomanIpgPayment): GatewayVerified {
  return {
    ok: true,
    amountRial: Number(payment.amount),
    psp: payment.psp ?? null,
    terminal: text(payment.terminal ?? payment.terminal_number),
    traceNumber: text(payment.trace_number),
    referenceNumber: text(payment.reference_number),
    maskedCard: payment.masked_paid_card_number?.replace(/\s+/g, '*') ?? null,
    raw: redact(payment),
  };
}

function refundResult(refund: TomanIpgRefund): GatewayRefundResult {
  const base = { ref: refund.uuid, raw: refund };
  switch (refund.status) {
    case TomanRefundStatus.SUCCESSFUL:
      return { ...base, state: 'succeeded' };
    case TomanRefundStatus.FAILED:
      return {
        ...base,
        state: 'failed',
        error: refund.error_detail ?? 'بازگشت به کارت انجام نشد',
      };
    case TomanRefundStatus.DENIED:
      return {
        ...base,
        state: 'denied',
        error: refund.error_detail ?? 'بازگشت به کارت رد شد',
      };
    case TomanRefundStatus.UNKNOWN:
      return { ...base, state: 'pending', unknown: true };
    default:
      return { ...base, state: 'pending' };
  }
}

function refundErrorMessage(error: TomanIpgError): string {
  if (error.has('not_enough_balance'))
    return 'موجودی کیف پول بازگشت درگاه کافی نیست';
  if (error.has('refund_not_allowed'))
    return 'بازگشت این پرداخت فعلاً ممکن نیست';
  if (error.has('invalid_refund_amount'))
    return 'مبلغ بازگشت از مبلغ پرداخت بیشتر است';
  if (error.has('payment_not_found')) return 'پرداخت نزد درگاه پیدا نشد';
  return error.message;
}

/** شمارهٔ کارمند به شکل 09xxxxxxxxx — هر چیز دیگری فرستاده نمی‌شود */
function normalizeMobile(mobile: string | null): string | null {
  if (!mobile) return null;
  const digits = mobile.replace(/\D/g, '').replace(/^(98|0098)/, '0');
  const normalized = digits.startsWith('9') ? `0${digits}` : digits;
  return /^09\d{9}$/.test(normalized) ? normalized : null;
}

function text(value: string | number | null | undefined): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : String(value);
}

/** موبایل کارمند در پاسخ خام ذخیره نمی‌شود */
function redact(payment: TomanIpgPayment): Record<string, unknown> {
  const { mobile_number, ...rest } = payment as TomanIpgPayment & {
    mobile_number?: unknown;
  };
  void mobile_number;
  return rest;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
