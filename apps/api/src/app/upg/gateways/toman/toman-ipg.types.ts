/**
 * قرارداد HTTP درگاه IPG تومان (docs.tomanpay.net/IPG). همهٔ مبالغ **ریال**‌اند.
 *
 * دو پیاده‌سازی دارد، مثل `GdsClient`: `TomanIpgHttpClient` (واقعی) و
 * `TomanIpgMockClient` (شبیه‌ساز درون‌حافظه‌ای). `TomanIpgGateway` منطق
 * وضعیت‌ها و خطاها را دارد، پس با mock هم همان منطق اجرا می‌شود.
 */

/** وضعیت پرداخت تومان */
export const TomanPaymentStatus = {
  CREATED: 1,
  TOKEN_ACQUIRED: 2,
  REDIRECTED: 3,
  CALLED_BACK: 4,
  VERIFIED: 5,
  REVERTED: 0,
  FAILED: -1,
  EXPIRED: -2,
  UNKNOWN: -3,
} as const;

/** وضعیت بازگشت پول تومان — 2، 3 و 4 نهایی‌اند */
export const TomanRefundStatus = {
  CREATED: 0,
  PENDING: 1,
  SUCCESSFUL: 2,
  FAILED: 3,
  DENIED: 4,
  UNKNOWN: -1,
} as const;

export interface TomanCreatePaymentBody {
  amount: number;
  callback_url: string;
  tracker_id: string;
  mobile_number?: string;
  options?: { terminal_number: string };
}

/** شیء Payment — verify، استعلام و بدنهٔ callback همه همین شکل‌اند */
export interface TomanIpgPayment {
  uuid: string;
  amount: number;
  status: number;
  tracker_id?: string | null;
  psp?: string | null;
  /** پاسخ verify `terminal` دارد و استعلام `terminal_number` */
  terminal?: string | number | null;
  terminal_number?: string | number | null;
  trace_number?: string | number | null;
  reference_number?: string | number | null;
  digital_receipt_number?: string | null;
  masked_paid_card_number?: string | null;
  error_detail?: string | null;
  created_at?: string;
  verified_at?: string | null;
}

export interface TomanIpgRefund {
  uuid: string;
  payment: string;
  status: number;
  amount: number;
  tracker_id?: string | null;
  error_detail?: string | null;
  withdraw_receipt_link?: string | null;
  created_at?: string;
}

/**
 * خطای تومان. بدنهٔ خطا `{ non_field_errors: [{code, detail}], <field>: [...] }`
 * است؛ کدها برای تصمیم، detail فقط برای لاگ.
 */
export class TomanIpgError extends Error {
  constructor(
    /** null یعنی پاسخی نرسید (timeout / شبکه) */
    readonly status: number | null,
    readonly codes: string[] = [],
    /** نام فیلدهایی که خطا به آن‌ها مربوط است */
    readonly fields: string[] = [],
    message?: string,
  ) {
    super(
      message ??
        (status === null
          ? 'پاسخی از درگاه تومان نرسید'
          : `درگاه تومان: HTTP ${status}${codes.length ? ` (${codes.join(', ')})` : ''}`),
    );
  }

  /** پاسخ از تومان رسید و درخواست را رد کرد (4xx) — نتیجه قطعی است */
  get rejected(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }

  has(...codes: string[]): boolean {
    return codes.some((code) => this.codes.includes(code));
  }
}

export interface TomanIpgApi {
  /** `true` فقط برای کلاینت واقعی */
  readonly live: boolean;
  createPayment(
    body: TomanCreatePaymentBody,
  ): Promise<{ uuid: string; tracker_id?: string | null }>;
  /** آدرسی که مرورگر کاربر به آن فرستاده می‌شود */
  redirectUrl(uuid: string, callbackUrl: string): string;
  verifyPayment(uuid: string): Promise<TomanIpgPayment>;
  getPayment(uuid: string): Promise<TomanIpgPayment>;
  createRefund(
    paymentUuid: string,
    body: { amount: number; tracker_id: string },
  ): Promise<TomanIpgRefund>;
  getRefundByTracker(trackerId: string): Promise<TomanIpgRefund>;
}
