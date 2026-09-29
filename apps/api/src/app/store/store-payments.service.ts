import { Injectable } from '@nestjs/common';
import {
  Receipt,
  StorePaymentReport,
  StoreStats,
  StoreStatsBucket,
  StoreStatsPoint,
} from '@sanpay/models';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { settlementStatus } from '../admin/payment-row';
import { StorePaymentReportQueryDto } from './dto/store-report.dto';

@Injectable()
export class StorePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** رسیدهای اخیر یک فروشگاه — تازه‌ترین اول */
  async recent(storeId: string, take = 50): Promise<Receipt[]> {
    const payments = await this.prisma.payment.findMany({
      where: { storeId },
      include: {
        employee: true,
        store: true,
        transactions: {
          include: { allocation: { include: { definition: true } } },
        },
        settlementItem: true,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return payments.map((payment) => ({
      id: payment.id,
      receiptNo: payment.receiptNo,
      storeName: payment.store.name,
      employeeName: `${payment.employee.firstName} ${payment.employee.lastName}`,
      amount: Number(payment.amount),
      createdAt: payment.createdAt.toISOString(),
      // `remainingAfter` عمداً ارسال نمی‌شود: ماندهٔ کیف پول کارمند به فروشگاه
      // مربوط نیست.
      lines: payment.transactions.map((transaction) => ({
        walletName: transaction.allocation.definition.name,
        icon: transaction.allocation.definition.icon,
        amount: Number(transaction.amount),
      })),
      settlement: {
        status: settlementStatus(payment.settlementItem?.status),
        settledAt: payment.settledAt?.toISOString() ?? null,
        followUpCode: payment.settlementItem?.followUpCode ?? null,
        receiptLink: payment.settlementItem?.receiptLink ?? null,
      },
    }));
  }

  async report(
    storeId: string,
    query: StorePaymentReportQueryDto,
  ): Promise<StorePaymentReport> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where = this.reportWhere(storeId, query);
    const succeededWhere: Prisma.PaymentWhereInput = {
      AND: [where, { settlementItem: { status: 'SUCCEEDED' } }],
    };

    const [payments, summary, settled] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employee: true, settlementItem: true },
      }),
      this.prisma.payment.aggregate({
        where,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: succeededWhere,
        _count: { _all: true },
        _sum: { amount: true },
      }),
    ]);

    return {
      items: payments.map((payment) => ({
        id: payment.id,
        receiptNo: payment.receiptNo,
        employeeName: `${payment.employee.firstName} ${payment.employee.lastName}`,
        amount: Number(payment.amount),
        createdAt: payment.createdAt.toISOString(),
        settlement: {
          status: settlementStatus(payment.settlementItem?.status),
          settledAt: payment.settledAt?.toISOString() ?? null,
          followUpCode: payment.settlementItem?.followUpCode ?? null,
        },
      })),
      total: summary._count._all,
      page,
      pageSize,
      summary: {
        count: summary._count._all,
        amount: Number(summary._sum.amount ?? 0n),
        settledCount: settled._count._all,
        settledAmount: Number(settled._sum.amount ?? 0n),
      },
    };
  }

  private reportWhere(
    storeId: string,
    query: StorePaymentReportQueryDto,
  ): Prisma.PaymentWhereInput {
    const q = query.q?.trim();
    const settlement = query.settlementStatus;
    const settlementWhere: Prisma.PaymentWhereInput =
      settlement === 'PENDING'
        ? { settlementItemId: null }
        : settlement === 'PROCESSING'
          ? {
              settlementItem: {
                status: {
                  in: ['CREATED', 'SUBMITTED', 'PROCESSING', 'UNKNOWN'],
                },
              },
            }
          : settlement === 'SUCCEEDED' || settlement === 'FAILED'
            ? { settlementItem: { status: settlement } }
            : {};

    return {
      storeId,
      ...settlementWhere,
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { receiptNo: { contains: q } },
              {
                employee: {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { personnelCode: { contains: q } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
  }

  /**
   * آمار فروش فروشگاه.
   *
   * عمداً سمت سرور جمع زده می‌شود. پنل تا امروز «فروش امروز» را از همان ۵۰
   * رسیدِ آخرِ `recent()` حساب می‌کرد؛ برای فروشگاهی که روزی بیش از ۵۰ خرید
   * دارد این عدد بی‌سروصدا کم گزارش می‌شد — دقیقاً روی شلوغ‌ترین روزها.
   */
  async stats(storeId: string): Promise<StoreStats> {
    const todayStart = startOfTehranDay(new Date());
    const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);
    const monthStart = new Date(todayStart.getTime() - 29 * DAY_MS);

    const [today, week, month, series] = await Promise.all([
      this.sumSince(storeId, todayStart),
      this.sumSince(storeId, weekStart),
      this.sumSince(storeId, monthStart),
      this.dailySeries(storeId, weekStart),
    ]);

    return { today, week, month, series };
  }

  private async sumSince(
    storeId: string,
    since: Date,
  ): Promise<StoreStatsBucket> {
    const result = await this.prisma.payment.aggregate({
      where: { storeId, createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    });
    return {
      total: Number(result._sum.amount ?? 0),
      count: result._count,
    };
  }

  /**
   * فروش روزانهٔ ۷ روز گذشته. روزهای بدون فروش هم با صفر برمی‌گردند، وگرنه
   * نمودار روزهای خالی را حذف می‌کند و شیب را دروغ نشان می‌دهد.
   */
  private async dailySeries(
    storeId: string,
    since: Date,
  ): Promise<StoreStatsPoint[]> {
    const payments = await this.prisma.payment.findMany({
      where: { storeId, createdAt: { gte: since } },
      select: { amount: true, createdAt: true },
    });

    const buckets = new Map<string, number>();
    for (let index = 0; index < 7; index += 1) {
      buckets.set(tehranDayKey(new Date(since.getTime() + index * DAY_MS)), 0);
    }
    for (const payment of payments) {
      const key = tehranDayKey(payment.createdAt);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + Number(payment.amount));
      }
    }

    return [...buckets].map(([date, total]) => ({ date, total }));
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * روزِ «امروز» باید روزِ تهران باشد، نه روزِ UTC — وگرنه فروش بین ۰۰:۰۰ و
 * ۰۳:۳۰ به بامداد به حساب دیروز می‌رفت. ایران از ۱۴۰۱ ساعت تابستانی ندارد،
 * پس آفست ثابت +03:30 امن است و به کتابخانهٔ منطقهٔ زمانی نیاز نیست.
 */
function tehranDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function startOfTehranDay(date: Date): Date {
  return new Date(`${tehranDayKey(date)}T00:00:00+03:30`);
}
