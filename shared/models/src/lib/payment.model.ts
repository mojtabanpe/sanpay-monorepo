/** یک کیف پول قابل استفاده در فروشگاهِ اسکن‌شده، به‌همراه سقف قابل برداشت */
export interface PayableWallet {
  /** شناسهٔ WalletAllocation — همان چیزی که هنگام پرداخت ارسال می‌شود */
  allocationId: string;
  name: string;
  icon: string | null;
  /** بیشترین مبلغی که از این کیف پول قابل کسر است (تومان) */
  max: number;
  expiresAt: string;
}

/** نتیجهٔ اسکن QR فروشگاه: فروشگاه + کیف‌پول‌های قابل استفاده در آن */
export interface StoreCheckout {
  storeId: string;
  /** کد کوتاه فروشگاه — هنگام ثبت پرداخت دوباره ارسال می‌شود */
  storeCode: string;
  storeName: string;
  storeCategory: string | null;
  /** کیف‌پول‌های فعال و منقضی‌نشدهٔ کارمند که در این فروشگاه اعتبار دارند */
  wallets: PayableWallet[];
  /** جمع سقف همهٔ کیف‌پول‌های بالا (تومان) */
  totalAvailable: number;
}

/** یک سطر پرداخت: چقدر از کدام کیف پول کسر شود */
export interface PaymentLineInput {
  allocationId: string;
  /** مبلغ (تومان) — عدد صحیح مثبت */
  amount: number;
}

export interface CreatePaymentInput {
  /** کد کوتاه فروشگاه (از QR یا تایپ دستی) */
  storeCode: string;
  lines: PaymentLineInput[];
}

/** سطر رسید — تفکیک مبلغ به‌ازای هر کیف پول */
export interface ReceiptLine {
  walletName: string;
  icon: string | null;
  amount: number;
  /**
   * ماندهٔ کیف پول بعد از این پرداخت (تومان) — فقط در رسیدِ خودِ کارمند پر
   * می‌شود؛ پنل فروشگاه نباید ماندهٔ کیف پول کارمند را ببیند.
   */
  remainingAfter?: number;
}

/** رسید پرداخت — هم در اپ کارمند و هم در پنل فروشگاه نمایش داده می‌شود */
export interface Receipt {
  id: string;
  /** شمارهٔ رسید که کارمند به فروشنده نشان می‌دهد */
  receiptNo: string;
  storeName: string;
  employeeName: string;
  /** جمع کل (تومان) */
  amount: number;
  /** زمان پرداخت (ISO) */
  createdAt: string;
  lines: ReceiptLine[];
}
