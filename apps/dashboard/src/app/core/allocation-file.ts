import { BulkAllocateEntry, OrganizationalRank } from '@sanpay/models';
import { PersianDate } from '@spartan-ng/brain/date-time';

export interface AllocationFileResult {
  entries: BulkAllocateEntry[];
  /** خطاهای هر سطر — سطر بد کل فایل را رد نمی‌کند، فقط گزارش می‌شود */
  errors: string[];
}

/** سرستون‌های پذیرفته‌شده — هم فارسی هم انگلیسی، تا فایلِ هر کسی باز شود */
const HEADERS = {
  nationalCode: [
    'کد ملی',
    'کدملی',
    'nationalcode',
    'national_code',
    'national code',
  ],
  organizationalRank: [
    'رده سازمانی',
    'ردهٔ سازمانی',
    'رده',
    'سمت',
    'organizational rank',
    'organizational_rank',
    'rank',
    'position',
  ],
  cap: ['سقف اعتبار', 'سقف', 'مبلغ', 'اعتبار', 'cap', 'amount', 'credit'],
  expiresAt: [
    'تاریخ انقضا',
    'انقضا',
    'تاریخ',
    'expiresat',
    'expires_at',
    'expiry',
    'date',
  ],
};

/**
 * فایل تخصیص گروهی (CSV یا XLSX) را به سطرهای `BulkAllocateEntry` تبدیل می‌کند.
 *
 * فایل چهار ستون دارد: کد ملی، ردهٔ سازمانی، سقف اعتبار (تومان) و تاریخ انقضای جلالی
 * (مثل ۱۴۰۵/۰۶/۳۱). ارقام فارسی و عربی، جداکنندهٔ هزار و جداکننده‌های `/`، `-`
 * و `.` در تاریخ همه پذیرفته می‌شوند، چون فایلی که واحد رفاه دستی می‌سازد
 * هیچ‌وقت یک‌دست نیست. تاریخ همین‌جا به میلادی تبدیل می‌شود چون API فقط
 * `YYYY-MM-DD` میلادی می‌فهمد.
 *
 * سرستون اختیاری است: اگر سطر اول سرستون باشد، ستون‌ها از روی نامشان تشخیص
 * داده می‌شوند؛ وگرنه ترتیب کد ملی، رده، سقف، انقضا فرض می‌شود.
 */
export async function parseAllocationFile(
  file: File,
): Promise<AllocationFileResult> {
  const rows = file.name.toLowerCase().endsWith('.csv')
    ? parseCsv(await file.text())
    : await readXlsx(file);

  const filled = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (!filled.length) return { entries: [], errors: ['فایل خالی است'] };

  const columns = detectColumns(filled[0]);
  const missingColumns = missingRequiredColumns(columns);
  if (missingColumns.length) {
    return {
      entries: [],
      errors: [`ستون‌های الزامی فایل پیدا نشد: ${missingColumns.join('، ')}`],
    };
  }
  if (!columns.fromHeader && filled[0].length < 4) {
    return {
      entries: [],
      errors: [
        'فایل بدون سرستون باید چهار ستون کد ملی، رده سازمانی، سقف و انقضا داشته باشد',
      ],
    };
  }
  const body = columns.fromHeader ? filled.slice(1) : filled;

  const entries: BulkAllocateEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  body.forEach((row, index) => {
    // شمارهٔ سطر همان چیزی است که کاربر در اکسل می‌بیند، پس ۱-پایه و با سرستون
    const lineNo = index + 1 + (columns.fromHeader ? 1 : 0);
    const nationalCode = toLatinDigits(row[columns.nationalCode] ?? '')
      .replace(/\D/g, '')
      .trim();
    if (!nationalCode) {
      errors.push(`سطر ${lineNo}: کد ملی خالی است`);
      return;
    }
    if (seen.has(nationalCode)) {
      errors.push(`سطر ${lineNo}: کد ملی ${nationalCode} تکراری است`);
      return;
    }

    const organizationalRank = parseOrganizationalRank(
      row[columns.organizationalRank] ?? '',
    );
    if (!organizationalRank) {
      errors.push(
        `سطر ${lineNo}: رده سازمانی نامعتبر است (مدیر، معاون، رییس یا کارمند)`,
      );
      return;
    }

    const capRaw = toLatinDigits(row[columns.cap] ?? '').replace(/[^\d]/g, '');
    const cap = Number(capRaw);
    if (!capRaw || !Number.isFinite(cap)) {
      errors.push(`سطر ${lineNo}: سقف اعتبار نامعتبر است`);
      return;
    }

    const expiresAt = parseJalaliCell(row[columns.expiresAt] ?? '');
    if (!expiresAt) {
      errors.push(`سطر ${lineNo}: تاریخ انقضا نامعتبر است (نمونه: ۱۴۰۵/۰۶/۳۱)`);
      return;
    }

    seen.add(nationalCode);
    entries.push({ nationalCode, organizationalRank, cap, expiresAt });
  });

  return { entries, errors };
}

/**
 * خوانندهٔ xlsx با import پویا بارگذاری می‌شود: ~۳۰ کیلوبایت است و فقط وقتی
 * لازم می‌شود که کاربر واقعاً فایل اکسل انتخاب کند، پس نباید در باندل اولیهٔ
 * داشبورد بنشیند. نقطهٔ ورود `/browser` است چون پکیج ریشهٔ export ندارد و
 * نسخهٔ node به `fs` وابسته است.
 */
async function readXlsx(file: File): Promise<string[][]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheet = await readXlsxFile(file);
  // تایپ `Sheet` کتابخانه آرایه‌ای از آرایه است اما متدهای Array را نشان نمی‌دهد
  return (Array.from(sheet) as unknown as unknown[][]).map((row) =>
    Array.from(row).map((cell) =>
      cell === null || cell === undefined ? '' : String(cell),
    ),
  );
}

/** ستون‌ها را از سرستون پیدا می‌کند، وگرنه به ترتیب پیش‌فرض برمی‌گردد */
function detectColumns(header: string[]): {
  nationalCode: number;
  organizationalRank: number;
  cap: number;
  expiresAt: number;
  fromHeader: boolean;
} {
  const normalizeHeader = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[\s_ـ]+/g, ' ');
  const normalized = header.map(normalizeHeader);
  const find = (names: string[]) =>
    normalized.findIndex((cell) =>
      names.some((name) => cell === normalizeHeader(name)),
    );

  const nationalCode = find(HEADERS.nationalCode);
  const organizationalRank = find(HEADERS.organizationalRank);
  const cap = find(HEADERS.cap);
  const expiresAt = find(HEADERS.expiresAt);

  if (
    [nationalCode, organizationalRank, cap, expiresAt].some(
      (index) => index >= 0,
    )
  ) {
    return {
      nationalCode,
      organizationalRank,
      cap,
      expiresAt,
      fromHeader: true,
    };
  }
  return {
    nationalCode: 0,
    organizationalRank: 1,
    cap: 2,
    expiresAt: 3,
    fromHeader: false,
  };
}

function missingRequiredColumns(
  columns: ReturnType<typeof detectColumns>,
): string[] {
  if (!columns.fromHeader) return [];
  return [
    [columns.nationalCode, 'کد ملی'],
    [columns.organizationalRank, 'رده سازمانی'],
    [columns.cap, 'سقف اعتبار'],
    [columns.expiresAt, 'تاریخ انقضا'],
  ]
    .filter(([index]) => Number(index) < 0)
    .map(([, label]) => String(label));
}

/** مقدار فارسی یا انگلیسی رده را به enum مشترک تبدیل می‌کند. */
function parseOrganizationalRank(raw: string): OrganizationalRank | null {
  const normalized = raw
    .trim()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-‌]+/g, '')
    .toLowerCase();

  const ranks: Record<string, OrganizationalRank> = {
    مدیر: 'MANAGER',
    manager: 'MANAGER',
    معاون: 'DEPUTY',
    deputy: 'DEPUTY',
    رییس: 'HEAD',
    رئیس: 'HEAD',
    head: 'HEAD',
    کارمند: 'EMPLOYEE',
    employee: 'EMPLOYEE',
  };
  return ranks[normalized] ?? null;
}

/** «۱۴۰۵/۰۶/۳۱» یا «1405-6-31» → «2026-09-22» */
function parseJalaliCell(raw: string): string | null {
  const parts = toLatinDigits(raw)
    .trim()
    .split(/[/\-.]/)
    .map((part) => Number(part.replace(/\D/g, '')));

  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  const [year, month, day] = parts;
  if (year < 1300 || year > 1500) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const [gy, gm, gd] = PersianDate.jalaliToGregorian(year, month, day);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/** ارقام فارسی (۰-۹) و عربی (٠-٩) → لاتین */
function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

/**
 * CSV سبک — نقل‌قول دوتایی و کاما/سمی‌کالن داخل نقل‌قول را می‌فهمد.
 * برای فایل چهارستونی که واحد رفاه از اکسل «Save as CSV» می‌گیرد کافی است و
 * ما را از یک وابستگی دیگر بی‌نیاز می‌کند.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  // BOM اکسل وگرنه به اول کد ملی سطر اول می‌چسبد
  const input = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index++) {
    const char = input[index];

    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',' || char === ';') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
