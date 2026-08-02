import { Injectable } from '@nestjs/common';
import { Receipt } from '@sanpay/models';
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
}
