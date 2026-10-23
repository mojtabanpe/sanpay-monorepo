import {
  CardRefundStatus,
  PaymentIntentPurpose,
  PaymentIntentStatus,
  UpgGatewayInfo,
} from './upg.model';

/**
 * UPG در داشبورد (docs/upg.md، فاز ۳): پرداخت‌های درگاه، صف بررسی دستی،
 * موجودی کیف پول بازگشت و پیکربندی درگاه‌ها. همهٔ مبالغ **تومان**‌اند.
 */
export type GatewayPaymentStatus = UpgGatewayInfo['status'];

export type GatewayReviewAction =
  'PAYMENT_VERIFIED' | 'PAYMENT_FAILED' | 'REFUND_SUCCEEDED' | 'REFUND_FAILED';

export interface AdminUpgEmployee {
  id: string;
  name: string;
  personnelCode: string;
  nationalCode: string;
}

export interface AdminGatewayPaymentRow {
  id: string;
  gateway: string;
  gatewayLabel: string;
  status: GatewayPaymentStatus;
  amount: number;
  refundedAmount: number;
  trackerId: string;
  ref: string | null;
  traceNumber: string | null;
  maskedCard: string | null;
  error: string | null;
  employee: AdminUpgEmployee;
  intent: { id: string; purpose: PaymentIntentPurpose; title: string };
  createdAt: string;
  verifiedAt: string | null;
}

export interface AdminGatewayRefundRow {
  id: string;
  gatewayPaymentId: string;
  gateway: string;
  amount: number;
  status: CardRefundStatus;
  trackerId: string;
  ref: string | null;
  error: string | null;
  maskedCard: string | null;
  employee: AdminUpgEmployee;
  createdAt: string;
  checkedAt: string | null;
  completedAt: string | null;
}

export interface AdminGatewayReview {
  id: string;
  action: GatewayReviewAction;
  gatewayRefundId: string | null;
  fromStatus: string;
  note: string;
  adminUsername: string;
  createdAt: string;
}

/** سطرهای کیف پولی که این پرداخت ساخت یا به آن مربوط است (TOPUP، WITHDRAWAL…) */
export interface AdminUpgTransaction {
  id: string;
  type: 'PURCHASE' | 'REFUND' | 'ADJUSTMENT' | 'TOPUP' | 'WITHDRAWAL';
  amount: number;
  walletName: string;
  personal: boolean;
  note: string | null;
  createdAt: string;
}

export interface AdminGatewayPaymentDetail extends AdminGatewayPaymentRow {
  psp: string | null;
  terminal: string | null;
  referenceNumber: string | null;
  /** آخرین پاسخ خام درگاه (موبایل کارمند از آن حذف شده) */
  raw: unknown;
  checkedAt: string | null;
  updatedAt: string;
  intent: AdminGatewayPaymentRow['intent'] & {
    status: PaymentIntentStatus;
    amount: number;
    gatewayAmount: number;
    refundedAmount: number;
    failureReason: string | null;
    createdAt: string;
    completedAt: string | null;
    /** همهٔ تلاش‌های درگاه همین intent — جدیدترین اول */
    attempts: {
      id: string;
      gateway: string;
      status: GatewayPaymentStatus;
      amount: number;
      createdAt: string;
    }[];
  };
  refunds: AdminGatewayRefundRow[];
  transactions: AdminUpgTransaction[];
  reviews: AdminGatewayReview[];
}

/** صف بررسی دستی: چیزهایی که هیچ cronی دیگر خودکار تکلیفشان را روشن نمی‌کند */
export interface AdminUpgReviewQueue {
  /** پرداخت‌های UNKNOWN — قدیمی‌ترین اول */
  payments: AdminGatewayPaymentRow[];
  /** بازگشت‌های UNKNOWN، و SUBMITTING/PENDING گیرکرده (آستانه‌ها در `stuck`) — قدیمی‌ترین اول */
  refunds: AdminGatewayRefundRow[];
  stuck: {
    /** SUBMITTING یعنی پاسخ ثبت نرسید؛ cron هر ۲ دقیقه دوباره می‌پرسد */
    submittingMinutes: number;
    /** PENDING عادی است تا چرخهٔ تسویهٔ بانک تمام شود */
    pendingDays: number;
  };
}

/** شمارندهٔ منوی «بررسی دستی درگاه» */
export interface AdminUpgReviewCount {
  payments: number;
  refunds: number;
  total: number;
}

export interface AdminUpgReviewInput {
  outcome: 'verified' | 'failed' | 'succeeded';
  /** چرا — در یادداشت حسابرسی ذخیره می‌شود */
  note: string;
}

/** استعلام زندهٔ درگاه برای کمک به تصمیم دستی — چیزی را تغییر نمی‌دهد */
export interface AdminUpgInquiry {
  state: string;
  error: string | null;
  raw: unknown;
}

export interface AdminRefundWallet {
  gateway: string;
  gatewayLabel: string;
  /** live = حساب واقعی؛ mock = شبیه‌ساز با ماندهٔ ثابت */
  mode: 'live' | 'mock';
  /** برای پرداخت تازه فعال است؟ */
  enabled: boolean;
  /** null اگر خواندن ممکن نشد (`error`) */
  balance: number | null;
  address: string | null;
  /** کف هشدار (تومان) */
  minimum: number;
  /** جمع بازگشت‌های در جریان روی همین درگاه — باید از مانده برداشت شوند */
  openRefunds: number;
  /** بازگشت‌های DENIED در ۷ روز گذشته — یعنی کیف پول خالی شده بود */
  deniedRecently: number;
  low: boolean;
  error: string | null;
}

export interface AdminUpgGatewayConfig {
  key: string;
  label: string;
  /** برای پرداخت تازه انتخاب می‌شود */
  enabled: boolean;
  /** هر پرداختی را «موفق» می‌پذیرد — mock یا شبیه‌ساز تومان */
  simulated: boolean;
  capabilities: { refund: boolean; partialRefund: boolean };
  /** وزن در راهبرد weighted */
  weight: number | null;
  callbackUrl: string;
}

export interface AdminUpgSettings {
  /** UPG_GATEWAYS به همان ترتیب = اولویت */
  configured: string[];
  /** کلیدهایی از UPG_GATEWAYS که کنار گذاشته شدند و چرا */
  rejected: { key: string; reason: string }[];
  strategy: 'priority' | 'weighted';
  /** پرداخت کارتی امکان دارد؟ (دست‌کم یک درگاه فعال) */
  available: boolean;
  production: boolean;
  allowMock: boolean;
  publicUrl: string;
  gateways: AdminUpgGatewayConfig[];
  toman: {
    mode: 'live' | 'mock';
    ipgUrl: string | null;
    authUrl: string | null;
    /** فقط اینکه کدام دسته متغیر استفاده می‌شود — هرگز خود مقدار */
    credentials: 'TOMAN_IPG_*' | 'TOMAN_*' | 'none';
    terminal: string | null;
  };
  /** نتیجهٔ بازگشت در درگاه‌های آزمایشی (UPG_MOCK_REFUND_RESULT) */
  mockRefundResult: string | null;
}
