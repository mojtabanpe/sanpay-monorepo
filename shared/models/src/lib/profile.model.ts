/** پروفایل کارمند — همان چیزی که login و `GET /api/auth/me` برمی‌گردانند */
export interface EmployeeProfile {
  id: string;
  /** کد ملی — شناسهٔ ورود */
  nationalCode: string;
  personnelCode: string;
  birthDate?: string | null;
  birthdayToday?: boolean;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** آدرس عکس پروفایل (`/api/avatars/…`)؛ null یعنی بدون عکس */
  avatarUrl?: string | null;
  company: { id: string; name: string; logoUrl?: string | null };
  organizationalRank: import('./admin.model').OrganizationalRank;
}

export interface EmployeeAuthResponse {
  accessToken: string;
  employee: EmployeeProfile;
  requiresPasswordSetup: boolean;
}

export interface OtpRequestResult {
  sent: boolean;
  expiresInSeconds: number;
  retryAfterSeconds: number;
  message?: string;
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
  lines: Array<{
    /** شناسهٔ تخصیص کیف پول برای فیلتر دقیق سابقه در خانه */
    allocationId: string;
    walletName: string;
    icon: string | null;
    amount: number;
  }>;
}

/** گردش ثبت‌شدهٔ کیف پول؛ مبلغ به تومان، جهت مستقل از مبلغ مثبت است. */
export interface WalletTransactionItem {
  id: string;
  allocationId: string;
  walletName: string;
  type: 'PURCHASE' | 'REFUND' | 'ADJUSTMENT' | 'TOPUP' | 'WITHDRAWAL';
  direction: 'credit' | 'debit';
  amount: number;
  createdAt: string;
  note: string | null;
  storeName: string | null;
}
export interface WalletTransactionPage {
  items: WalletTransactionItem[];
  nextCursor: string | null;
}

/** یک ورود مستقل؛ نام دستگاه از اطلاعات اعلام‌شدهٔ مرورگر استخراج می‌شود. */
export interface EmployeeSessionView {
  id: string;
  device: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}
