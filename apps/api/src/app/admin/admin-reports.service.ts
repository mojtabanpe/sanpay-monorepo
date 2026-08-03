import { Injectable } from '@nestjs/common';
import {
  AdminBookingRow,
  AdminOverview,
  AdminPaymentRow,
  Paginated,
} from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';
import { BookingQueryDto, PaymentQueryDto } from './dto/admin.dto';
import { paymentRowInclude, toPaymentRow } from './payment-row';

@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<AdminOverview> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const since14 = new Date(startOfToday);
    since14.setDate(since14.getDate() - 13);
    const since30 = new Date(startOfToday);
    since30.setDate(since30.getDate() - 29);

    const [
      employeeTotal,
      employeeActive,
      storeTotal,
      storeActive,
      definitionCount,
      allocationStats,
      todayStats,
      monthStats,
      totalStats,
      bookingTotal,
      bookingPending,
      bookingSum,
      dailyPayments,
      topStoreRows,
      recent,
    ] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.employee.count({ where: { isActive: true } }),
      this.prisma.store.count(),
      this.prisma.store.count({ where: { isActive: true } }),
      this.prisma.walletDefinition.count(),
      this.prisma.walletAllocation.aggregate({
        where: { isActive: true, expiresAt: { gt: now } },
        _count: { _all: true },
        _sum: { cap: true, spent: true },
      }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: startOfToday } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.hotelBooking.count(),
      this.prisma.hotelBooking.count({ where: { status: 'PENDING' } }),
      this.prisma.hotelBooking.aggregate({ _sum: { amount: true } }),
      this.prisma.payment.findMany({
        where: { createdAt: { gte: since14 } },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.payment.groupBy({
        by: ['storeId'],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: paymentRowInclude,
      }),
    ]);

    const storeNames = new Map(
      (
        await this.prisma.store.findMany({
          where: { id: { in: topStoreRows.map((row) => row.storeId) } },
          select: { id: true, name: true },
        })
      ).map((store) => [store.id, store.name]),
    );

    // ۱۴ سطل روزانه — روزهای بدون خرید هم باید صفر برگردند تا نمودار پیوسته بماند
    const buckets = new Map<string, { count: number; amount: number }>();
    for (let i = 0; i < 14; i++) {
      const day = new Date(since14);
      day.setDate(day.getDate() + i);
      buckets.set(isoDay(day), { count: 0, amount: 0 });
    }
    for (const payment of dailyPayments) {
      const bucket = buckets.get(isoDay(payment.createdAt));
      if (!bucket) continue;
      bucket.count++;
      bucket.amount += Number(payment.amount);
    }

    const allocatedCap = Number(allocationStats._sum.cap ?? 0n);
    const allocatedSpent = Number(allocationStats._sum.spent ?? 0n);

    return {
      employees: { total: employeeTotal, active: employeeActive },
      stores: { total: storeTotal, active: storeActive },
      wallets: {
        definitions: definitionCount,
        allocations: allocationStats._count._all,
      },
      credit: {
        allocated: allocatedCap,
        spent: allocatedSpent,
        remaining: allocatedCap - allocatedSpent,
      },
      payments: {
        today: {
          count: todayStats._count._all,
          amount: Number(todayStats._sum.amount ?? 0n),
        },
        month: {
          count: monthStats._count._all,
          amount: Number(monthStats._sum.amount ?? 0n),
        },
        total: {
          count: totalStats._count._all,
          amount: Number(totalStats._sum.amount ?? 0n),
        },
      },
      bookings: {
        total: bookingTotal,
        pending: bookingPending,
        amount: Number(bookingSum._sum.amount ?? 0n),
      },
      daily: [...buckets.entries()].map(([date, value]) => ({ date, ...value })),
      topStores: topStoreRows.map((row) => ({
        id: row.storeId,
        name: storeNames.get(row.storeId) ?? '—',
        count: row._count._all,
        amount: Number(row._sum.amount ?? 0n),
      })),
      recentPayments: recent.map(toPaymentRow),
    };
  }

  async payments(query: PaymentQueryDto): Promise<Paginated<AdminPaymentRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();

    const where = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
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
                    { firstName: { contains: q, mode: 'insensitive' as const } },
                    { lastName: { contains: q, mode: 'insensitive' as const } },
                    { personnelCode: { contains: q } },
                    { nationalCode: { contains: q } },
                  ],
                },
              },
              { store: { name: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: paymentRowInclude,
      }),
    ]);

    return { items: payments.map(toPaymentRow), total, page, pageSize };
  }

  async bookings(query: BookingQueryDto): Promise<Paginated<AdminBookingRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();

    const where = {
      ...(query.status
        ? { status: query.status as 'CONFIRMED' | 'PENDING' | 'REJECTED' | 'CANCELED' }
        : {}),
      ...(q
        ? {
            OR: [
              { referenceNo: { contains: q } },
              { hotelName: { contains: q, mode: 'insensitive' as const } },
              { guestName: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, bookings] = await Promise.all([
      this.prisma.hotelBooking.count({ where }),
      this.prisma.hotelBooking.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { employee: true },
      }),
    ]);

    return {
      items: bookings.map((booking) => ({
        id: booking.id,
        referenceNo: booking.referenceNo,
        status: booking.status,
        hotelName: booking.hotelName,
        roomType: booking.roomType,
        checkin: booking.checkin.toISOString(),
        nights: booking.nights,
        guestName: booking.guestName,
        amount: Number(booking.amount),
        payable: Number(booking.payable),
        refundedAmount:
          booking.refundedAmount === null ? null : Number(booking.refundedAmount),
        settledAt: booking.settledAt?.toISOString() ?? null,
        createdAt: booking.createdAt.toISOString(),
        employee: {
          id: booking.employee.id,
          name: `${booking.employee.firstName} ${booking.employee.lastName}`,
          personnelCode: booking.employee.personnelCode,
        },
      })),
      total,
      page,
      pageSize,
    };
  }
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}
