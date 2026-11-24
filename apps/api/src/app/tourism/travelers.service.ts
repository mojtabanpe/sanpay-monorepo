import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PreviousTraveler, SaveTravelerInput } from '@sanpay/models';
import { Prisma, Traveler } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** مشخصاتی که یک رزرو از یک مسافر دارد؛ فیلدِ نداده یعنی «دست نزن». */
export interface TravelerSnapshot {
  nationalCode: string;
  /** نام فارسی — فقط رزرو هتل می‌فرستد */
  firstName?: string;
  lastName?: string;
  /** نام انگلیسی — پرواز، یا هتل اگر کاربر وارد کرده باشد */
  firstNameEn?: string;
  lastNameEn?: string;
  mobile?: string;
  birthdate?: string;
  gender?: 'male' | 'female';
  nationality?: string;
  passportNumber?: string;
  passportExpirationDate?: string;
  passportIssueCountry?: string;
}

type Db = PrismaService | Prisma.TransactionClient;

/**
 * دفترچهٔ مسافران کارمند — تنها منبع «مسافران قبلی» در رزرو هتل و پرواز.
 *
 * هر رزرو مسافرانش را upsert می‌کند (کلید: کد ملی). رزرو هتل گذرنامه و
 * ملیت ندارد، پس فقط فیلدهایی که آمده‌اند به‌روز می‌شوند و مشخصات پروازیِ
 * قبلی همان مسافر پاک نمی‌شود.
 */
@Injectable()
export class TravelersService {
  constructor(private readonly prisma: PrismaService) {}

  async remember(
    employeeId: string,
    travelers: TravelerSnapshot[],
    db: Db = this.prisma,
  ): Promise<void> {
    const lastUsedAt = new Date();
    for (const traveler of travelers) {
      // مسافر خارجیِ پرواز کد ملی ندارد و قابل شناسایی دوباره نیست
      if (!traveler.nationalCode) continue;
      const named = { ...traveler, ...splitByScript(traveler) };
      const fields = definedOnly({
        ...named,
        nationalCode: undefined,
      });
      await db.traveler.upsert({
        where: {
          employeeId_nationalCode: {
            employeeId,
            nationalCode: traveler.nationalCode,
          },
        },
        create: {
          employeeId,
          nationalCode: traveler.nationalCode,
          ...fields,
          // مسافری که اول با پرواز ثبت شده تا اولین رزرو هتل نام فارسی ندارد
          firstName: named.firstName || null,
          lastName: named.lastName || null,
          lastUsedAt,
        },
        update: { ...fields, lastUsedAt },
      });
    }
  }

  /** مسافران ذخیره‌شده و اخیراً استفاده‌شده — همان فهرست برای پروفایل، هتل و پرواز */
  async recent(employeeId: string): Promise<PreviousTraveler[]> {
    const rows = await this.prisma.traveler.findMany({
      where: { employeeId },
      orderBy: { lastUsedAt: 'desc' },
      take: 50,
    });
    return rows.map(toPreviousTraveler);
  }

  /** افزودن دستی مسافر به دفترچهٔ مسافران در پروفایل */
  async create(
    employeeId: string,
    input: SaveTravelerInput,
  ): Promise<PreviousTraveler> {
    const data = normalizeSaveInput(input);
    const existing = await this.prisma.traveler.findUnique({
      where: {
        employeeId_nationalCode: {
          employeeId,
          nationalCode: data.nationalCode,
        },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('مسافری با این کد ملی قبلاً ثبت شده است');
    }
    const row = await this.prisma.traveler.create({
      data: {
        employeeId,
        ...data,
        lastUsedAt: new Date(),
      },
    });
    return toPreviousTraveler(row);
  }

  /** ویرایش مشخصات مسافر ذخیره‌شده */
  async update(
    employeeId: string,
    id: string,
    input: SaveTravelerInput,
  ): Promise<PreviousTraveler> {
    const current = await this.prisma.traveler.findFirst({
      where: { id, employeeId },
      select: { id: true, nationalCode: true },
    });
    if (!current) {
      throw new NotFoundException('مسافر مورد نظر پیدا نشد');
    }
    const data = normalizeSaveInput(input);
    if (data.nationalCode !== current.nationalCode) {
      const duplicate = await this.prisma.traveler.findUnique({
        where: {
          employeeId_nationalCode: {
            employeeId,
            nationalCode: data.nationalCode,
          },
        },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('مسافری با این کد ملی قبلاً ثبت شده است');
      }
    }
    const row = await this.prisma.traveler.update({
      where: { id },
      data: {
        ...data,
        lastUsedAt: new Date(),
      },
    });
    return toPreviousTraveler(row);
  }

  /** حذف مسافر از دفترچهٔ مسافران کارمند */
  async remove(employeeId: string, id: string): Promise<{ ok: boolean }> {
    const result = await this.prisma.traveler.deleteMany({
      where: { id, employeeId },
    });
    if (result.count === 0) {
      throw new NotFoundException('مسافر مورد نظر پیدا نشد');
    }
    return { ok: true };
  }
}

function toPreviousTraveler(row: Traveler): PreviousTraveler {
  return {
    id: row.id,
    // خالی یعنی نام فارسی ثبت نشده (مسافری که فقط پرواز داشته)
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    nationalCode: row.nationalCode,
    mobile: row.mobile ?? '',
    lastUsedAt: row.lastUsedAt.toISOString(),
    ...definedOnly({
      firstNameEn: row.firstNameEn ?? undefined,
      lastNameEn: row.lastNameEn ?? undefined,
      birthdate: row.birthdate ?? undefined,
      gender:
        row.gender === 'male' || row.gender === 'female'
          ? row.gender
          : undefined,
      nationality: row.nationality ?? undefined,
      passportNumber: row.passportNumber ?? undefined,
      passportExpirationDate: row.passportExpirationDate ?? undefined,
      passportIssueCountry: row.passportIssueCountry ?? undefined,
    }),
  };
}

function normalizeSaveInput(input: SaveTravelerInput) {
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  const firstNameEn = clean(input.firstNameEn);
  const lastNameEn = clean(input.lastNameEn);
  const hasPersian = Boolean(firstName && lastName);
  const hasEnglish = Boolean(firstNameEn && lastNameEn);
  if (!hasPersian && !hasEnglish) {
    throw new BadRequestException(
      'حداقل نام و نام خانوادگی فارسی یا انگلیسی مسافر را وارد کنید',
    );
  }
  return {
    nationalCode: input.nationalCode.trim(),
    firstName,
    lastName,
    firstNameEn,
    lastNameEn,
    mobile: clean(input.mobile),
    birthdate: clean(input.birthdate),
    gender: input.gender ?? null,
    nationality: cleanUpper(input.nationality),
    passportNumber: cleanUpper(input.passportNumber),
    passportExpirationDate: clean(input.passportExpirationDate),
    passportIssueCountry: cleanUpper(input.passportIssueCountry),
  };
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function cleanUpper(value: string | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

const LATIN = /^[A-Za-z][A-Za-z' -]*$/;

/**
 * ستون فارسی هرگز نام لاتین نمی‌گیرد: اگر مهمان هتل نامش را انگلیسی در
 * فیلد «نام» نوشته باشد، همان نام انگلیسی ثبت می‌شود (اگر جدا نداده باشد)
 * و نام فارسی دست نمی‌خورد — وگرنه فرم هتل بعداً نام انگلیسی پیشنهاد می‌داد.
 */
function splitByScript(t: TravelerSnapshot): Partial<TravelerSnapshot> {
  const latin =
    !!t.firstName &&
    !!t.lastName &&
    LATIN.test(t.firstName.trim()) &&
    LATIN.test(t.lastName.trim());
  if (!latin) return {};
  return {
    firstName: undefined,
    lastName: undefined,
    firstNameEn: t.firstNameEn || t.firstName,
    lastNameEn: t.lastNameEn || t.lastName,
  };
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>;
}
