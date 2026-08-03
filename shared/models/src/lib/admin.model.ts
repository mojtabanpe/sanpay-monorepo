/**
 * مدل‌های داشبورد مدیریت (`apps/dashboard`).
 * همهٔ مبالغ تومان و اعداد صحیح‌اند؛ تاریخ‌ها ISO string.
 */

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';

export interface AdminProfile {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** پاسخ صفحه‌بندی‌شدهٔ همهٔ فهرست‌های داشبورد */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type WalletKind = 'CREDIT' | 'RATION' | 'TOURISM';

// ─── نمای کلی ────────────────────────────────────────────────────────────────

export interface AdminOverview {
  employees: { total: number; active: number };
  stores: { total: number; active: number };
  wallets: { definitions: number; allocations: number };
  credit: {
    /** جمع سقف تخصیص‌های فعال */
    allocated: number;
    /** جمع مصرف‌شده */
    spent: number;
    /** جمع مانده */
    remaining: number;
  };
  payments: {
    today: { count: number; amount: number };
    month: { count: number; amount: number };
    total: { count: number; amount: number };
  };
  bookings: { total: number; pending: number; amount: number };
  /** خرید روزانه — ۱۴ روز اخیر، قدیمی به جدید */
  daily: Array<{ date: string; count: number; amount: number }>;
  /** پرفروش‌ترین فروشگاه‌ها (۳۰ روز اخیر) */
  topStores: Array<{ id: string; name: string; count: number; amount: number }>;
  recentPayments: AdminPaymentRow[];
}

// ─── کارمند ──────────────────────────────────────────────────────────────────

export interface AdminEmployeeRow {
  id: string;
  nationalCode: string;
  personnelCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  /** تعداد کیف‌پول‌های فعال و منقضی‌نشده */
  walletCount: number;
  /** جمع ماندهٔ کیف‌پول‌های فعال (تومان) */
  remaining: number;
}

export interface AdminAllocationRow {
  id: string;
  definitionId: string;
  definitionName: string;
  kind: WalletKind;
  icon: string | null;
  cap: number;
  spent: number;
  remaining: number;
  expiresAt: string;
  isActive: boolean;
  createdAt: string;
}

export interface AdminEmployeeDetail extends AdminEmployeeRow {
  allocations: AdminAllocationRow[];
  payments: AdminPaymentRow[];
  /** جمع خرید کارمند (تومان) */
  totalSpent: number;
}

export interface CreateEmployeeInput {
  nationalCode: string;
  personnelCode: string;
  firstName: string;
  lastName: string;
  phone?: string;
  /** رمز اولیه — اگر خالی باشد کد ملی استفاده می‌شود */
  password?: string;
}

export type UpdateEmployeeInput = Partial<
  Omit<CreateEmployeeInput, 'password'>
> & { isActive?: boolean };

// ─── فروشگاه ─────────────────────────────────────────────────────────────────

export interface AdminStoreRow {
  id: string;
  name: string;
  code: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  username: string;
  isActive: boolean;
  createdAt: string;
  /** تعداد کیف‌پول‌هایی که در این فروشگاه قابل خرج‌اند */
  walletCount: number;
  paymentCount: number;
  /** جمع فروش (تومان) */
  totalAmount: number;
}

export interface CreateStoreInput {
  name: string;
  /** اگر خالی باشد سرور یک کد یکتا می‌سازد */
  code?: string;
  category?: string;
  phone?: string;
  address?: string;
  username: string;
  password: string;
}

export type UpdateStoreInput = Partial<Omit<CreateStoreInput, 'password'>> & {
  isActive?: boolean;
};

// ─── تعریف کیف پول ───────────────────────────────────────────────────────────

export interface AdminWalletDefinitionRow {
  id: string;
  name: string;
  kind: WalletKind;
  description: string | null;
  icon: string | null;
  defaultCap: number | null;
  isActive: boolean;
  createdAt: string;
  /** فروشگاه‌های متصل (برای TOURISM همیشه خالی) */
  stores: Array<{ id: string; name: string; code: string }>;
  allocationCount: number;
  allocatedAmount: number;
  spentAmount: number;
}

export interface CreateWalletDefinitionInput {
  name: string;
  kind: WalletKind;
  description?: string;
  icon?: string;
  defaultCap?: number;
  storeIds?: string[];
}

export type UpdateWalletDefinitionInput = Partial<CreateWalletDefinitionInput> & {
  isActive?: boolean;
};

export interface CreateAllocationInput {
  employeeId: string;
  definitionId: string;
  cap: number;
  /** ISO date */
  expiresAt: string;
}

export interface UpdateAllocationInput {
  cap?: number;
  expiresAt?: string;
  isActive?: boolean;
}

/** تخصیص گروهی یک کیف پول به چند کارمند */
export interface BulkAllocateInput {
  definitionId: string;
  /** خالی یعنی همهٔ کارمندان فعال */
  employeeIds?: string[];
  cap: number;
  expiresAt: string;
}

export interface BulkAllocateResult {
  created: number;
  updated: number;
  skipped: number;
}

// ─── پرداخت و رزرو ───────────────────────────────────────────────────────────

export interface AdminPaymentRow {
  id: string;
  receiptNo: string;
  amount: number;
  createdAt: string;
  employee: { id: string; name: string; personnelCode: string };
  store: { id: string; name: string; code: string };
  lines: Array<{ walletName: string; icon: string | null; amount: number }>;
}

export interface AdminBookingRow {
  id: string;
  referenceNo: string;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED' | 'CANCELED';
  hotelName: string;
  roomType: string;
  checkin: string;
  nights: number;
  guestName: string;
  amount: number;
  payable: number;
  refundedAmount: number | null;
  settledAt: string | null;
  createdAt: string;
  employee: { id: string; name: string; personnelCode: string };
}
