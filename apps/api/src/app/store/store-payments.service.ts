import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Receipt,
  StorePaymentReport,
  StorePaymentReportFilters,
  StoreStats,
  StoreStatsBucket,
  StoreStatsPoint,
} from '@sanpay/models';
import * as ExcelJS from 'exceljs';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { settlementStatus } from '../admin/payment-row';
import { StorePaymentReportQueryDto } from './dto/store-report.dto';

@Injectable()
export class StorePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * «آخرین پرداخت‌ها» — رسیدهایی که فروشنده هنوز تأیید نکرده، تازه‌ترین اول.
   * گزارش و آمار از این فیلتر جدا هستند و همهٔ پرداخت‌ها را می‌شمارند.
   */
  async recent(storeId: string, take = 50): Promise<Receipt[]> {
    const payments = await this.prisma.payment.findMany({
      where: { storeId, storeConfirmedAt: null },
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

  /**
   * فروشنده رسید را دید و تأیید کرد. idempotent: تأیید دوباره همان زمان اول
   * را نگه می‌دارد. رسید فروشگاه دیگر «پیدا نشد» است، نه «ممنوع».
   */
  async confirm(
    storeId: string,
    paymentId: string,
  ): Promise<{ id: string; storeConfirmedAt: string }> {
    await this.prisma.payment.updateMany({
      where: { id: paymentId, storeId, storeConfirmedAt: null },
      data: { storeConfirmedAt: new Date() },
    });
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, storeId },
      select: { id: true, storeConfirmedAt: true },
    });
    if (!payment?.storeConfirmedAt) {
      throw new NotFoundException('پرداخت پیدا نشد');
    }
    return {
      id: payment.id,
      storeConfirmedAt: payment.storeConfirmedAt.toISOString(),
    };
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
        pendingAmount: Number(
          (summary._sum.amount ?? 0n) - (settled._sum.amount ?? 0n),
        ),
      },
    };
  }

  /**
   * گزینه‌های فیلتر گزارش: کیف‌پول‌هایی که به این فروشگاه وصل‌اند و شرکت‌هایشان.
   * کیف پول بایگانی‌شده هم می‌آید، چون پرداخت‌های قدیمی‌اش در گزارش هست.
   */
  async reportFilters(storeId: string): Promise<StorePaymentReportFilters> {
    const links = await this.prisma.walletDefinitionStore.findMany({
      where: { storeId },
      include: { definition: { include: { company: true } } },
    });
    const companies = new Map<string, string>();
    for (const link of links) {
      companies.set(link.definition.company.id, link.definition.company.name);
    }
    return {
      wallets: links
        .map(({ definition }) => ({
          id: definition.id,
          name: definition.name,
          companyId: definition.companyId,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fa')),
      companies: [...companies]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fa')),
    };
  }

  /** همهٔ سطرهای فیلترشده (بدون صفحه‌بندی) + سطر «جمع کل» — مبالغ به ریال */
  async reportExcel(
    storeId: string,
    query: StorePaymentReportQueryDto,
  ): Promise<Buffer> {
    const payments = await this.prisma.payment.findMany({
      where: this.reportWhere(storeId, query),
      orderBy: { createdAt: 'desc' },
      include: { employee: true, settlementItem: true },
    });
    const labels: Record<string, string> = {
      PENDING: 'در انتظار تسویه',
      PROCESSING: 'در حال تسویه',
      SUCCEEDED: 'تسویه‌شده',
      FAILED: 'ناموفق',
    };
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('پرداخت‌ها', {
      views: [{ rightToLeft: true }],
    });
    sheet.columns = [
      { header: 'شماره رسید', key: 'receiptNo', width: 16 },
      { header: 'خریدار', key: 'employee', width: 24 },
      { header: 'مبلغ (ریال)', key: 'amount', width: 18 },
      { header: 'زمان پرداخت', key: 'createdAt', width: 22 },
      { header: 'وضعیت تسویه', key: 'settlement', width: 18 },
      { header: 'زمان تسویه', key: 'settledAt', width: 22 },
      { header: 'کد پیگیری', key: 'followUpCode', width: 18 },
    ];
    let total = 0n;
    for (const payment of payments) {
      total += payment.amount;
      sheet.addRow({
        receiptNo: payment.receiptNo,
        employee: `${payment.employee.firstName} ${payment.employee.lastName}`,
        amount: Number(payment.amount) * 10,
        createdAt: payment.createdAt,
        settlement: labels[settlementStatus(payment.settlementItem?.status)],
        settledAt: payment.settledAt ?? '',
        followUpCode: payment.settlementItem?.followUpCode ?? '',
      });
    }
    const totalRow = sheet.addRow({
      receiptNo: 'جمع کل',
      employee: `${payments.length} پرداخت`,
      amount: Number(total) * 10,
    });
    totalRow.font = { bold: true };
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn('amount').numFmt = '#,##0';
    sheet.getColumn('createdAt').numFmt = 'yyyy-mm-dd hh:mm';
    sheet.getColumn('settledAt').numFmt = 'yyyy-mm-dd hh:mm';
    sheet.autoFilter = { from: 'A1', to: 'G1' };
    return Buffer.from(await workbook.xlsx.writeBuffer());
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
      ...(query.companyId ? { employee: { companyId: query.companyId } } : {}),
      ...(query.walletDefinitionId
        ? {
            transactions: {
              some: {
                type: 'PURCHASE' as const,
                allocation: { definitionId: query.walletDefinitionId },
              },
            },
          }
        : {}),
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
