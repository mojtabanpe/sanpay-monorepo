import { Injectable } from '@nestjs/common';
import { PreviousTraveler } from '@sanpay/models';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** مشخصاتی که یک رزرو از یک مسافر دارد؛ فیلدِ نداده یعنی «دست نزن». */
export interface TravelerSnapshot {
  nationalCode: string;
  firstName: string;
  lastName: string;
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
      const fields = definedOnly({ ...traveler, nationalCode: undefined });
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
          firstName: traveler.firstName,
          lastName: traveler.lastName,
          lastUsedAt,
        },
        update: { ...fields, lastUsedAt },
      });
    }
  }

  /** ده مسافرِ اخیراً استفاده‌شده — همان فهرست برای هتل و پرواز */
  async recent(employeeId: string): Promise<PreviousTraveler[]> {
    const rows = await this.prisma.traveler.findMany({
      where: { employeeId },
      orderBy: { lastUsedAt: 'desc' },
      take: 10,
    });
    return rows.map((row) => ({
      firstName: row.firstName,
      lastName: row.lastName,
      nationalCode: row.nationalCode,
      mobile: row.mobile ?? '',
      lastUsedAt: row.lastUsedAt.toISOString(),
      ...definedOnly({
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
    }));
  }
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== ''),
  ) as Partial<T>;
}
