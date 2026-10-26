import { FlightBookingStatus } from './flight.model';
import { BookingStatus } from './tourism.model';

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

/** فهرست پرداخت‌ها + جمع مبلغِ همهٔ صفحه‌های فیلترشده (نه فقط صفحهٔ جاری) */
export interface AdminPaymentPage extends Paginated<AdminPaymentRow> {
  sumAmount: number;
}

export type WalletKind = 'CREDIT' | 'RATION' | 'TOURISM';
export type OrganizationalRank = 'MANAGER' | 'DEPUTY' | 'HEAD' | 'EMPLOYEE';

export interface AdminCompanyRow {
  logoUrl: string | null;
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  employeeCount: number;
  walletCount: number;
}

export interface CreateCompanyInput {
  logoUrl?: string;
  name: string;
}

export type UpdateCompanyInput = Partial<CreateCompanyInput> & {
  isActive?: boolean;
};

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
  birthDate?: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  company: { id: string; name: string };
  organizationalRank: OrganizationalRank;
  isActive: boolean;
  createdAt: string;
  /** تعداد کیف‌پول‌های فعال و منقضی‌نشده */
  walletCount: number;
  /** جمع ماندهٔ کیف‌پول‌های فعال (تومان) */
  remaining: number;
  /** آیا کارمند پس از ورود با OTP برای خودش رمز تعیین کرده است؟ */
  hasPassword: boolean;
  /** آدرس عکس پروفایل؛ null یعنی بدون عکس */
  avatarUrl?: string | null;
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
  personnelCode?: string;
  birthDate?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  companyId: string;
  organizationalRank: OrganizationalRank;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput> & {
  isActive?: boolean;
};

export interface EmployeeImportEntry {
  rowNumber: number;
  nationalCode: string;
  personnelCode?: string;
  birthDate?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  organizationalRank: OrganizationalRank;
}

export interface ImportEmployeesInput {
  companyId: string;
  entries: EmployeeImportEntry[];
}

export interface ImportEmployeesResult {
  created: number;
  rejected: Array<{
    rowNumber: number;
    nationalCode?: string;
    reason: string;
  }>;
}

// ─── فروشگاه ─────────────────────────────────────────────────────────────────

export interface AdminStoreRow {
  id: string;
  name: string;
  code: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  settlementIban: string | null;
  settlementOwnerName: string | null;
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
  phone: string;
  address: string;
  logoUrl?: string;
  latitude?: number;
  longitude?: number;
  /** شبای ۲۶ نویسه‌ای مقصد تسویه (IR + 24 رقم) */
  settlementIban: string;
  settlementOwnerName?: string;
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
  company: { id: string; name: string };
  kind: WalletKind;
  description: string | null;
  icon: string | null;
  imageUrl?: string | null;
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
  companyId: string;
  kind: WalletKind;
  description?: string;
  icon?: string;
  imageUrl?: string;
  /** `null` یعنی نامحدود — هنگام تخصیص، سقف دستی وارد می‌شود */
  defaultCap?: number | null;
  storeIds?: string[];
}

export type UpdateWalletDefinitionInput =
  Partial<CreateWalletDefinitionInput> & {
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
/** یک سطر فایل تخصیص: کارمند با رده، سقف و انقضای مخصوص خودش */
export interface BulkAllocateEntry {
  nationalCode: string;
  organizationalRank: OrganizationalRank;
  cap: number;
  /** ISO date */
  expiresAt: string;
}

export interface BulkAllocateInput {
  definitionId: string;
  /** خالی یعنی همهٔ کارمندان فعال */
  employeeIds?: string[];
  /** سطرهای فایل — اگر بیاید، فقط به همین‌ها و با مقادیر خودشان تخصیص می‌شود */
  entries?: BulkAllocateEntry[];
  /** سقف یکسان — وقتی `entries` نیامده باشد لازم است */
  cap?: number;
  /** انقضای یکسان — وقتی `entries` نیامده باشد لازم است */
  expiresAt?: string;
}

export interface BulkAllocateResult {
  created: number;
  updated: number;
  skipped: number;
  /** کد ملی‌های فایل که کارمندی با آن‌ها پیدا نشد */
  notFound: string[];
  /** ردیف‌هایی که ردهٔ فایل با ردهٔ ثبت‌شدهٔ کارمند هم‌خوان نیست */
  rankMismatches: Array<{
    nationalCode: string;
    fileRank: OrganizationalRank;
    employeeRank: OrganizationalRank;
  }>;
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
  settlement: {
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
    settledAt: string | null;
    followUpCode: string | null;
  };
}

export interface AdminBookingRow {
  id: string;
  referenceNo: string;
  /** همان اتحادیهٔ رزرو کارمند — تکرارش اینجا باعث شد افزودن HOLD از قلم بیفتد */
  status: BookingStatus;
  /** نام تأمین‌کننده («هتل‌یار» / «اقامت۲۴») */
  providerName: string;
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

export interface AdminFlightBookingRow {
  id: string;
  confirmationCode: string | null;
  status: FlightBookingStatus;
  origin: string;
  destination: string;
  departureTime: string;
  returnTime: string | null;
  airline: string;
  /** Display name from the supplier airline catalog. */
  airlineName?: string;
  flightNumber: string;
  passengerCount: number;
  amount: number;
  refunded: boolean;
  createdAt: string;
  employee: { id: string; name: string; personnelCode: string };
}

/**
 * گزارش تفکیک پرداخت گردشگری (هتل/پرواز): چه مقدار از اعتبار (بن) و چه مقدار
 * با کارت از درگاه بوده. مبلغ خالص کارت (بعد از بازگشت وجه) مبنای صدور فاکتور
 * به نام شخص در سامانهٔ مودیان است. همهٔ مبالغ تومان.
 */
export interface AdminTourismSplitPerson {
  employee: {
    id: string;
    name: string;
    nationalCode: string;
    personnelCode: string;
  };
  /** تعداد خریدهای نهایی‌شده */
  count: number;
  /** جمع مبلغ خریدها */
  total: number;
  /** سهم اعتبار (بن)، خالص از بازگشت وجه */
  credit: number;
  /** سهم کارت درگاه، قبل از بازگشت وجه */
  card: number;
  /** سهم کارت که به کارت/کیف پول شخصی برگشته */
  cardRefunded: number;
  /** کارت − بازگشتی = مبنای فاکتور مودیان */
  invoiceBase: number;
}

export interface AdminTourismSplitItem {
  intentId: string;
  kind: 'HOTEL' | 'FLIGHT';
  title: string;
  employeeId: string;
  employeeName: string;
  nationalCode: string;
  total: number;
  credit: number;
  card: number;
  cardRefunded: number;
  invoiceBase: number;
  completedAt: string;
}

export interface AdminTourismSplitReport {
  persons: AdminTourismSplitPerson[];
  items: AdminTourismSplitItem[];
  totals: Omit<AdminTourismSplitPerson, 'employee'>;
}
