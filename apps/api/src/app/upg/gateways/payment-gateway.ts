/**
 * قرارداد یک درگاه پرداخت در UPG. تومان، جیبیت و درگاه آزمایشی (mock) هرکدام
 * یک پیاده‌سازی‌اند و `GatewayRegistry` تصمیم می‌گیرد پرداخت تازه به کدام برود.
 *
 * مبالغ این قرارداد **ریال**‌اند — همان واحد درگاه‌ها. تبدیل تومان↔ریال فقط
 * در `UpgService` انجام می‌شود.
 */
export interface GatewayCreateInput {
  /** مبلغ (ریال) */
  amountRial: number;
  /** شناسهٔ یکتای ما؛ در callback برمی‌گردد */
  trackerId: string;
  /** آدرس مطلق callback همین درگاه */
  callbackUrl: string;
  /** موبایل کارمند — درگاه کارت‌های ذخیره‌شده را پیشنهاد می‌دهد */
  mobile: string | null;
}

export interface GatewayCreated {
  /** شناسهٔ پرداخت نزد درگاه */
  ref: string;
  /** کاربر به این آدرس فرستاده می‌شود */
  redirectUrl: string;
  raw?: unknown;
}

/** آنچه از بدنهٔ callback بیرون می‌کشیم — فقط برای پیدا کردن پرداخت، نه برای تصمیم */
export interface GatewayCallback {
  trackerId: string;
  ref: string | null;
  raw: Record<string, unknown>;
}

export interface GatewayVerified {
  /** فقط `true` یعنی پول قطعاً گرفته شد */
  ok: boolean;
  /** مبلغ تأییدشده از سوی درگاه (ریال) — با مبلغ ما مقایسه می‌شود */
  amountRial: number | null;
  /** `true` وقتی نتیجه قطعی نیست (مثلاً timeout) — نه موفق و نه ناموفق */
  unknown?: boolean;
  /**
   * `true` وقتی درگاه می‌گوید کاربر هنوز در صفحهٔ بانک است (callback زودتر از
   * موعد یا جعلی). پرداخت دست نمی‌خورد؛ cron استعلام بعداً تکلیفش را روشن می‌کند.
   */
  pending?: boolean;
  psp?: string | null;
  terminal?: string | null;
  traceNumber?: string | null;
  referenceNumber?: string | null;
  maskedCard?: string | null;
  error?: string | null;
  raw?: unknown;
}

export interface GatewayPaymentRef {
  ref: string;
  trackerId: string;
  amountRial: number;
  createdAt: Date;
}

/**
 * وضعیت پرداخت از نگاه درگاه، برای cron استعلام (پرداخت‌هایی که callback
 * آن‌ها هرگز نرسید):
 * - `pending`: کاربر هنوز در صفحهٔ بانک است یا آن را رها کرده
 * - `returned`: درگاه کاربر را به callback فرستاده ولی ما verify نکرده‌ایم
 * - `verified`: پول قطعاً گرفته شده (جزئیات در `verified`)
 * - `failed`: پرداخت انجام نشد یا برگشت خورد
 * - `expired`: کاربر برنگشت و درگاه خودش پرداخت را بست
 * - `unknown`: خود درگاه هم نمی‌داند — بررسی دستی، هرگز خودکار
 */
export interface GatewayInquiry {
  state: 'pending' | 'returned' | 'verified' | 'failed' | 'expired' | 'unknown';
  verified?: GatewayVerified;
  error?: string | null;
  raw?: unknown;
}

/**
 * وضعیت یک بازگشت پول به کارت:
 * - `pending`: ثبت شده و در جریان است (Unknown تومان هم همین حساب می‌شود)
 * - `succeeded`: پول به کارت رسید
 * - `failed` / `denied`: پولی به کارت نرفت — UPG مبلغ را به مانده برمی‌گرداند
 * - `missing`: درگاه چنین بازگشتی ندارد (درخواست ساخت هرگز به آن نرسید)
 * - `unreachable`: پاسخی نرسید — نمی‌دانیم ثبت شد یا نه، بعداً با tracker پیگیری می‌شود
 */
export interface GatewayRefundResult {
  state:
    'pending' | 'succeeded' | 'failed' | 'denied' | 'missing' | 'unreachable';
  /** وضعیت خام درگاه، برای نمایش «نامعلوم» به کارمند */
  unknown?: boolean;
  ref?: string | null;
  error?: string | null;
  raw?: unknown;
}

export interface GatewayRefundRef {
  /** پرداختی که پول از آن برمی‌گردد */
  payment: GatewayPaymentRef;
  /** شناسهٔ یکتای ما برای همین بازگشت */
  trackerId: string;
  /** شناسهٔ بازگشت نزد درگاه، اگر رسیده */
  ref: string | null;
  /** ریال */
  amountRial: number;
}

/** موجودی کیف پولی که درگاه بازگشت‌ها را از آن برمی‌دارد */
export interface GatewayRefundWallet {
  /** ریال */
  balanceRial: number;
  address: string | null;
}

export interface PaymentGateway {
  /** کلید پایدار؛ در `GatewayPayment.gateway` ذخیره می‌شود */
  readonly key: string;
  /** نام نمایشی */
  readonly label: string;
  /**
   * درگاه آزمایشی یا شبیه‌ساز — هر پرداختی را «موفق» می‌پذیرد، پس در
   * production بدون `UPG_ALLOW_MOCK=true` فعال نمی‌شود.
   */
  readonly simulated: boolean;
  /**
   * `refund` = بازگشت پول به همان کارت از طریق همین درگاه؛ `partialRefund` =
   * کمتر از کل مبلغ یک پرداخت. درگاهی که refund ندارد سهمش در «بازگشت پول»
   * پروفایل حساب نمی‌شود (صف بازگشت دستی داشبورد — فاز ۳).
   */
  readonly capabilities: { refund: boolean; partialRefund: boolean };

  create(input: GatewayCreateInput): Promise<GatewayCreated>;
  parseCallback(body: Record<string, unknown>): GatewayCallback;
  /**
   * تأیید نهایی. داده‌های callback ممکن است دستکاری شده باشند؛ نتیجه فقط از
   * همین‌جا معتبر است. `callback` فقط برای درگاه آزمایشی کاربرد دارد و وقتی
   * cron استعلام verify را صدا می‌زند `null` است.
   */
  verify(
    payment: GatewayPaymentRef,
    callback: GatewayCallback | null,
  ): Promise<GatewayVerified>;
  /** استعلام وضعیت بدون تغییر آن — هرگز verify یا reverse نمی‌کند */
  inquire(payment: GatewayPaymentRef): Promise<GatewayInquiry>;
  /** ثبت بازگشت پول — خطای شبکه را به `unreachable` تبدیل می‌کند، پرتاب نمی‌کند */
  refund?(refund: GatewayRefundRef): Promise<GatewayRefundResult>;
  /** وضعیت بازگشتی که قبلاً ثبت شده (با `trackerId`، حتی اگر `ref` نرسیده) */
  refundStatus?(refund: GatewayRefundRef): Promise<GatewayRefundResult>;
  /**
   * موجودی کیف پول بازگشت، برای هشدار داشبورد (Denied تومان یعنی خالی شده).
   * درگاهی که بازگشت را از کیف پول جدا برنمی‌دارد این را ندارد.
   */
  refundWallet?(): Promise<GatewayRefundWallet>;
}

/** خطای ساخت پرداخت — راهبرد `priority` با آن سراغ درگاه بعدی می‌رود */
export class GatewayUnavailableError extends Error {}
