/** پروفایل کارمند — همان چیزی که login و `GET /api/auth/me` برمی‌گردانند */
export interface EmployeeProfile {
  id: string;
  /** کد ملی — شناسهٔ ورود */
  nationalCode: string;
  personnelCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

/** خلاصهٔ وضعیت اعتبار برای کارت بالای صفحهٔ پروفایل */
export interface ProfileSummary {
  /** جمع ماندهٔ همهٔ کیف‌پول‌های فعال (تومان) */
  totalRemaining: number;
  /** تعداد کیف‌پول‌های فعال و منقضی‌نشده */
  walletCount: number;
  /** نزدیک‌ترین تاریخ انقضا (ISO) — اگر کیف پولی نمانده باشد null */
  nextExpiry: string | null;
  /** جمع خرید ماه جاری (تومان) */
  spentThisMonth: number;
  /** تعداد خریدهای ثبت‌شده */
  paymentCount: number;
}

/** یک سطر در تاریخچهٔ خرید کارمند */
export interface PaymentHistoryItem {
  id: string;
  receiptNo: string;
  storeName: string;
  /** جمع کل (تومان) */
  amount: number;
  createdAt: string;
  /** تفکیک به‌ازای هر کیف پول */
  lines: Array<{ walletName: string; icon: string | null; amount: number }>;
}
