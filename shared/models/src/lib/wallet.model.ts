export type WalletIcon = 'food' | 'grocery' | 'sport' | 'health';

/** کیف پول اعتباری — بخشی از اعتبار رفاهی که در فروشگاه‌های مشخصی قابل خرج است */
export interface Wallet {
  id: string;
  name: string;
  /** اسلاگ آیکون (WalletIcon) — مقادیر ناشناخته با آیکون پیش‌فرض نمایش داده می‌شوند */
  icon: string | null;
  imageUrl?: string | null;
  /** سقف اعتبار (ریال) */
  cap: number;
  /** ماندهٔ اعتبار (ریال) */
  remaining: number;
  /** تاریخ انقضا (ISO) — نمایش جلالی سمت کلاینت انجام می‌شود */
  expiresAt: string;
  /** فروشگاه‌های قابل استفاده */
  stores: string[];
}
