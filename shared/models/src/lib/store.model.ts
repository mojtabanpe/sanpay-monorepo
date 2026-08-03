/** کیف پولی که در یک فروشگاه قابل خرج است — نمای خلاصه برای فهرست فروشگاه‌ها */
export interface StoreWalletBadge {
  /** شناسهٔ WalletAllocation */
  allocationId: string;
  name: string;
  icon: string | null;
  /** ماندهٔ قابل خرج در این فروشگاه (تومان) */
  remaining: number;
}

/** یک فروشگاه طرف قرارداد که کارمند با کیف‌پول‌های خودش می‌تواند از آن خرید کند */
export interface EmployeeStore {
  id: string;
  /** کد کوتاه فروشگاه — همان چیزی که روی QR صندوق چاپ شده */
  code: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  /** کیف‌پول‌های کارمند که در این فروشگاه اعتبار دارند */
  wallets: StoreWalletBadge[];
  /** جمع ماندهٔ کیف‌پول‌های بالا (تومان) */
  totalAvailable: number;
}
