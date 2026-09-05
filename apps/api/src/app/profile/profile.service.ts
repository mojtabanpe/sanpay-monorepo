import { Injectable } from '@nestjs/common';
import { PaymentHistoryItem, ProfileSummary } from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** خلاصهٔ اعتبار و خرید — کارت بالای صفحهٔ پروفایل */
  async summary(employeeId: string): Promise<ProfileSummary> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allocations, monthAggregate, paymentCount] = await Promise.all([
      this.prisma.walletAllocation.findMany({
        where: {
          employeeId,
          isActive: true,
          expiresAt: { gt: now },
          definition: { isActive: true },
        },
        select: { cap: true, spent: true, expiresAt: true },
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.payment.aggregate({
        where: { employeeId, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.payment.count({ where: { employeeId } }),
    ]);

    const live = allocations.filter((a) => a.cap - a.spent > 0n);

    return {
      totalRemaining: live.reduce((sum, a) => sum + Number(a.cap - a.spent), 0),
      walletCount: live.length,
      // allocations از قبل بر اساس expiresAt مرتب است
      nextExpiry: live[0]?.expiresAt.toISOString() ?? null,
      spentThisMonth: Number(monthAggregate._sum.amount ?? 0n),
      paymentCount,
    };
  }

  /** تاریخچهٔ خرید کارمند — جدیدترین اول */
  async payments(
    employeeId: string,
    limit = 30,
  ): Promise<PaymentHistoryItem[]> {
    const payments = await this.prisma.payment.findMany({
      where: { employeeId },
      include: {
        store: { select: { name: true } },
        transactions: {
          include: {
            allocation: {
              include: { definition: { select: { name: true, icon: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return payments.map((payment) => ({
      id: payment.id,
      receiptNo: payment.receiptNo,
      storeName: payment.store.name,
      amount: Number(payment.amount),
      createdAt: payment.createdAt.toISOString(),
      lines: payment.transactions.map((transaction) => ({
        allocationId: transaction.allocationId,
        walletName: transaction.allocation.definition.name,
        icon: transaction.allocation.definition.icon,
        amount: Number(transaction.amount),
      })),
    }));
  }
}
