import { EmployeeImportEntry, OrganizationalRank } from '@sanpay/models';

export interface EmployeeFileResult {
  entries: EmployeeImportEntry[];
  errors: string[];
}

const HEADERS: Record<string, string[]> = {
  nationalCode: ['کد ملی', 'کدملی', 'national code', 'nationalcode'],
  personnelCode: ['کد پرسنلی', 'کدپرسنلی', 'personnel code', 'personnelcode'],
  firstName: ['نام', 'first name', 'firstname'],
  lastName: ['نام خانوادگی', 'نام‌خانوادگی', 'last name', 'lastname'],
  phone: ['موبایل', 'شماره موبایل', 'تلفن همراه', 'phone', 'mobile'],
  organizationalRank: [
    'رده سازمانی',
    'ردهٔ سازمانی',
    'رده',
    'سمت',
    'organizational rank',
    'rank',
  ],
};

export async function parseEmployeeFile(
  file: File,
): Promise<EmployeeFileResult> {
  const rows = file.name.toLowerCase().endsWith('.csv')
    ? parseCsv(await file.text())
    : await readXlsx(file);
  const filled = rows.filter((row) => row.some((cell) => cell.trim()));
  if (!filled.length) return { entries: [], errors: ['فایل خالی است'] };

  const normalized = filled[0].map(normalizeHeader);
  const columns = Object.fromEntries(
    Object.entries(HEADERS).map(([key, names]) => [
      key,
      normalized.findIndex((cell) =>
        names.some((name) => cell === normalizeHeader(name)),
      ),
    ]),
  ) as Record<keyof typeof HEADERS, number>;
  const missing = Object.entries(columns)
    .filter(([, index]) => index < 0)
    .map(
      ([key]) =>
        ({
          nationalCode: 'کد ملی',
          personnelCode: 'کد پرسنلی',
          firstName: 'نام',
          lastName: 'نام خانوادگی',
          phone: 'موبایل',
          organizationalRank: 'رده سازمانی',
        })[key],
    );
  if (missing.length) {
    return {
      entries: [],
      errors: [`ستون‌های الزامی فایل پیدا نشد: ${missing.join('، ')}`],
    };
  }

  const entries: EmployeeImportEntry[] = [];
  const errors: string[] = [];
  filled.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const value = (key: keyof typeof HEADERS) =>
      (row[columns[key]] ?? '').trim();
    const nationalCode = digits(value('nationalCode')).replace(/\D/g, '');
    const personnelCode = digits(value('personnelCode'));
    const firstName = value('firstName');
    const lastName = value('lastName');
    const phone = digits(value('phone')).replace(/\D/g, '');
    const organizationalRank = parseRank(value('organizationalRank'));

    if (!/^\d{10}$/.test(nationalCode)) {
      errors.push(`سطر ${rowNumber}: کد ملی باید ۱۰ رقم باشد`);
    } else if (!personnelCode || !firstName || !lastName) {
      errors.push(`سطر ${rowNumber}: نام، نام خانوادگی یا کد پرسنلی خالی است`);
    } else if (!/^09\d{9}$/.test(phone)) {
      errors.push(`سطر ${rowNumber}: شماره موبایل معتبر نیست`);
    } else if (!organizationalRank) {
      errors.push(`سطر ${rowNumber}: رده سازمانی نامعتبر است`);
    } else {
      entries.push({
        rowNumber,
        nationalCode,
        personnelCode,
        firstName,
        lastName,
        phone,
        organizationalRank,
      });
    }
  });
  return { entries, errors };
}

function parseRank(raw: string): OrganizationalRank | null {
  const value = raw
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\s_\-‌]+/g, '')
    .toLowerCase();
  return (
    (
      {
        مدیر: 'MANAGER',
        manager: 'MANAGER',
        معاون: 'DEPUTY',
        deputy: 'DEPUTY',
        رییس: 'HEAD',
        رئیس: 'HEAD',
        head: 'HEAD',
        کارمند: 'EMPLOYEE',
        employee: 'EMPLOYEE',
      } as Record<string, OrganizationalRank>
    )[value] ?? null
  );
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_ـ]+/g, ' ');
}

function digits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

async function readXlsx(file: File): Promise<string[][]> {
  const { default: readXlsxFile } = await import('read-excel-file/browser');
  const sheet = await readXlsxFile(file);
  return (Array.from(sheet) as unknown as unknown[][]).map((row) =>
    Array.from(row).map((cell) =>
      cell === null || cell === undefined ? '' : String(cell),
    ),
  );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',' || char === ';') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[index + 1] === '\n') index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
