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

/** پروفایل فروشگاهِ واردشده در پنل فروشنده (`GET /api/store/me`) */
export interface StoreProfile {
  id: string;
  name: string;
  /** کد کوتاه — محتوای QR صندوق `SANPAY:S:<code>` است */
  code: string;
  category: string | null;
}

/** جمع فروش در یک بازهٔ زمانی */
export interface StoreStatsBucket {
  /** جمع مبلغ (تومان) */
  total: number;
  /** تعداد خرید */
  count: number;
}

/** فروش یک روز — برای نمودار داشبورد فروشنده */
export interface StoreStatsPoint {
  /** `YYYY-MM-DD` میلادی، به وقت تهران */
  date: string;
  total: number;
}

/** آمار فروش فروشگاه (`GET /api/store/stats`) */
export interface StoreStats {
  today: StoreStatsBucket;
  week: StoreStatsBucket;
  month: StoreStatsBucket;
  /** ۷ روز گذشته، شامل روزهای بدون فروش با مقدار صفر */
  series: StoreStatsPoint[];
}
