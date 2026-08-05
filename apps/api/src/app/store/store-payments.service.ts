import { Injectable } from '@nestjs/common';
import {
  Receipt,
  StoreStats,
  StoreStatsBucket,
  StoreStatsPoint,
} from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';

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
    }));
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
