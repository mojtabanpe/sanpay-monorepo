import { Receipt } from './payment.model';

/**
 * UPG — درگاه پرداخت یکپارچه (docs/upg.md). هر پرداخت کارمند یک «درخواست
 * پرداخت» است که بخش خرید می‌سازد و UPG تصمیم می‌گیرد از اعتبار، کارت یا هر
 * دو تأمین شود.
 */
export type PaymentIntentPurpose = 'STORE' | 'HOTEL' | 'FLIGHT';

export type PaymentIntentStatus =
  | 'PENDING'
  | 'AWAITING_GATEWAY'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELED';

/** پاسخ بخش خرید وقتی خرید را به UPG می‌سپارد */
export interface UpgIntentCreated {
  intentId: string;
}

/** یک منبع پول قابل انتخاب در صفحهٔ UPG */
export interface UpgSource {
  allocationId: string;
  name: string;
  icon: string | null;
  /** بیشترین مبلغ قابل کسر (تومان) */
  max: number;
  /**
   * `PERSONAL` مانده‌ای است که از پرداخت‌های کارتی قبلی برگشته — به کاربر
   * به‌عنوان «کیف پول» نشان داده نمی‌شود.
   */
  kind: 'WELFARE' | 'PERSONAL';
}

export interface UpgLine {
  allocationId: string;
  /** مبلغ (تومان) */
  amount: number;
}

export interface UpgPayInput {
  /** سهم هر منبع؛ باقی‌ماندهٔ مبلغ با کارت پرداخت می‌شود */
  lines: UpgLine[];
}

/** جزئیات پرداخت کارتی که روی رسید نشان داده می‌شود */
export interface UpgGatewayInfo {
  amount: number;
  status:
    'CREATED' | 'REDIRECTED' | 'VERIFIED' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';
  traceNumber: string | null;
  referenceNumber: string | null;
  terminal: string | null;
  maskedCard: string | null;
}

/** چیزی که بعد از پرداخت موفق نشان داده می‌شود — به نوع خرید بستگی دارد */
export type UpgResult =
  | { kind: 'store-receipt'; receipt: Receipt }
  | { kind: 'link'; path: string; label: string };

export interface UpgIntentView {
  id: string;
  purpose: PaymentIntentPurpose;
  status: PaymentIntentStatus;
  title: string;
  subtitle: string | null;
  /** مبلغ کل (تومان) */
  amount: number;
  /** سهم کارت در آخرین تقسیم (تومان) */
  gatewayAmount: number;
  failureReason: string | null;
  expiresAt: string;
  sources: UpgSource[];
  /** تقسیم پیشنهادی: اول اعتبار، باقی کارت */
  suggested: UpgLine[];
  /** درگاهی برای پرداخت کارتی فعال است؟ اگر نه، کل مبلغ باید از اعتبار باشد */
  cardAvailable: boolean;
  /** پرداخت کارتیِ آخرین تلاش، اگر بوده */
  gateway: UpgGatewayInfo | null;
  /** فقط وقتی `COMPLETED` است */
  result: UpgResult | null;
  /** مسیر بازگشت به بخش خرید وقتی کاربر انصراف می‌دهد */
  backPath: string;
}

export type UpgPayResponse =
  { kind: 'redirect'; url: string } | { kind: 'done'; intent: UpgIntentView };

/**
 * «بازگشت پول» پروفایل — ماندهٔ پرداخت‌های کارتی قبلی (مثلاً خریدی که لغو شد)
 * به همان کارت برمی‌گردد. این مانده هرگز به‌عنوان «کیف پول» نمایش داده نمی‌شود.
 */
export type CardRefundStatus =
  | 'SUBMITTING'
  | 'PENDING'
  | 'UNKNOWN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'DENIED';

export interface CardRefundItem {
  id: string;
  /** تومان */
  amount: number;
  status: CardRefundStatus;
  /** کارتی که پول به آن برمی‌گردد */
  maskedCard: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CardRefundSummary {
  /** ماندهٔ پرداخت‌های کارتی (تومان) */
  balance: number;
  /** چقدر از آن از طریق درگاه قابل بازگشت است (تومان) */
  refundable: number;
  /** کمترین مبلغ یک درخواست (تومان)، مگر کل مانده کمتر باشد */
  minimum: number;
  /** آخرین درخواست‌ها، جدیدترین اول */
  refunds: CardRefundItem[];
}

export interface CardRefundInput {
  /** تومان */
  amount: number;
}
