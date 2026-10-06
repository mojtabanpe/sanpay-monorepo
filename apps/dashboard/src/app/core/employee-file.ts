import { isoToJalali, jalaliToIso } from '@sanpay/dates';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { EmployeeImportEntry, OrganizationalRank } from '@sanpay/models';

export interface EmployeeFileResult {
  entries: EmployeeImportEntry[];
  errors: string[];
}

const HEADERS: Record<string, string[]> = {
  nationalCode: ['کد ملی', 'کدملی', 'national code', 'nationalcode'],
  birthDay: ['روز تولد', 'birthday'],
  birthMonth: ['ماه تولد', 'birthmonth'],
  birthYear: ['سال تولد', 'birthyear'],
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
    .filter(([key, index]) => index < 0 && !key.startsWith('birth'))
    .map(
      ([key]) =>
        ({
          nationalCode: 'کد ملی',
          birthDay: 'روز تولد',
          birthMonth: 'ماه تولد',
          birthYear: 'سال تولد',
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
    let birthDate: string | undefined;
    try {
      birthDate = parseBirthDate(
        value('birthYear'),
        value('birthMonth'),
        value('birthDay'),
      );
    } catch {
      errors.push(`سطر ${rowNumber}: تاریخ تولد شمسی معتبر وارد کنید`);
      return;
    }
    const firstName = value('firstName');
    const lastName = value('lastName');
    const phone = digits(value('phone')).replace(/\D/g, '');
    const organizationalRank = parseRank(value('organizationalRank'));

    if (!/^\d{10}$/.test(nationalCode)) {
      errors.push(`سطر ${rowNumber}: کد ملی باید ۱۰ رقم باشد`);
    } else if (!firstName || !lastName) {
      errors.push(`سطر ${rowNumber}: نام یا نام خانوادگی خالی است`);
    } else if (!/^09\d{9}$/.test(phone)) {
      errors.push(`سطر ${rowNumber}: شماره موبایل معتبر نیست`);
    } else if (!organizationalRank) {
      errors.push(`سطر ${rowNumber}: رده سازمانی نامعتبر است`);
    } else {
      entries.push({
        rowNumber,
        nationalCode,
        birthDate,
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

/** Blank birthday is allowed for existing employees; partial and impossible dates are rejected. */
export function parseBirthDate(
  year: string,
  month: string,
  day: string,
): string | undefined {
  const parts = [year, month, day].map((part) => digits(part.trim()));
  if (parts.every((part) => !part)) return undefined;
  if (parts.some((part) => !/^\d+$/.test(part)))
    throw new Error('روز، ماه و سال تولد را کامل وارد کنید');
  const [y, m, d] = parts.map(Number);
  if (y < 1200 || m < 1 || m > 12 || d < 1 || d > 31)
    throw new Error('تاریخ تولد معتبر نیست');
  const iso = jalaliToIso(new JalaliDate(y, m, d));
  const roundTrip = isoToJalali(iso);
  if (
    roundTrip.year !== y ||
    roundTrip.month !== m ||
    roundTrip.day !== d ||
    iso > new Date().toISOString().slice(0, 10)
  )
    throw new Error('تاریخ تولد معتبر نیست');
  return iso;
}

export function employeeTemplateCsv(): string {
  return '\uFEFFکد ملی,نام,نام خانوادگی,موبایل,رده سازمانی,روز تولد,ماه تولد,سال تولد\r\n0012345678,علی,رضایی,09123456789,کارمند,15,7,1370\r\n';
}
