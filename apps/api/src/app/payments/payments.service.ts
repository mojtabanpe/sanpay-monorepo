import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreatePaymentInput, Receipt, StoreCheckout } from '@sanpay/models';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentEventsService } from './payment-events.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PaymentEventsService,
  ) {}

  /**
   * بعد از اسکن QR فروشگاه: فروشگاه + کیف‌پول‌هایی که این کارمند می‌تواند در آن
   * خرج کند، هرکدام با سقف قابل برداشت. کلاینت از روی همین سقف‌ها ورودی مبلغ را
   * محدود می‌کند.
   */
  async checkout(employeeId: string, storeCode: string): Promise<StoreCheckout> {
    const store = await this.prisma.store.findUnique({
      where: { code: storeCode.trim().toUpperCase() },
    });
    if (!store || !store.isActive) {
      throw new NotFoundException('فروشگاهی با این کد پیدا نشد');
    }

    const allocations = await this.prisma.walletAllocation.findMany({
      where: {
        employeeId,
        isActive: true,
        expiresAt: { gt: new Date() },
        definition: {
          isActive: true,
          stores: { some: { storeId: store.id } },
        },
      },
      include: { definition: true },
      orderBy: { expiresAt: 'asc' },
    });

    const wallets = allocations
      .map((allocation) => ({
        allocationId: allocation.id,
        name: allocation.definition.name,
        icon: allocation.definition.icon,
        max: Number(allocation.cap - allocation.spent),
        expiresAt: allocation.expiresAt.toISOString(),
      }))
      .filter((wallet) => wallet.max > 0);

    return {
      storeId: store.id,
      storeCode: store.code,
      storeName: store.name,
      storeCategory: store.category,
      wallets,
      totalAvailable: wallets.reduce((sum, wallet) => sum + wallet.max, 0),
    };
  }

  /**
   * ثبت پرداخت. مبلغ می‌تواند بین چند کیف پول شکسته شود؛ همهٔ سطرها در یک
   * تراکنش دیتابیس ثبت می‌شوند تا یا همه انجام شود یا هیچ‌کدام.
   */
  async create(employeeId: string, input: CreatePaymentInput): Promise<Receipt> {
    const store = await this.prisma.store.findUnique({
      where: { code: input.storeCode.trim().toUpperCase() },
    });
    if (!store || !store.isActive) {
      throw new NotFoundException('فروشگاهی با این کد پیدا نشد');
    }

    const lines = input.lines.filter((line) => line.amount > 0);
    if (lines.length === 0) {
      throw new BadRequestException('مبلغ پرداخت باید بیشتر از صفر باشد');
    }
    if (new Set(lines.map((line) => line.allocationId)).size !== lines.length) {
      throw new BadRequestException('هر کیف پول فقط یک‌بار قابل انتخاب است');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException('کارمند پیدا نشد');
    }

    const receipt = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          receiptNo: await this.nextReceiptNo(tx),
          employeeId,
          storeId: store.id,
          amount: BigInt(lines.reduce((sum, line) => sum + line.amount, 0)),
        },
      });

      const receiptLines = [];
      for (const line of lines) {
        const allocation = await tx.walletAllocation.findUnique({
          where: { id: line.allocationId },
          include: {
            definition: { include: { stores: { where: { storeId: store.id } } } },
          },
        });

        if (!allocation || allocation.employeeId !== employeeId) {
          throw new NotFoundException('کیف پول انتخاب‌شده پیدا نشد');
        }
        if (!allocation.isActive || !allocation.definition.isActive) {
          throw new BadRequestException(
            `کیف پول «${allocation.definition.name}» غیرفعال است`,
          );
        }
        if (allocation.expiresAt <= new Date()) {
          throw new BadRequestException(
            `اعتبار کیف پول «${allocation.definition.name}» منقضی شده است`,
          );
        }
        if (allocation.definition.stores.length === 0) {
          throw new BadRequestException(
            `کیف پول «${allocation.definition.name}» در ${store.name} قابل استفاده نیست`,
          );
        }

        const remaining = allocation.cap - allocation.spent;
        if (BigInt(line.amount) > remaining) {
          throw new BadRequestException(
            `مبلغ واردشده از ماندهٔ کیف پول «${allocation.definition.name}» بیشتر است`,
          );
        }

        // شرط `spent` در where باعث می‌شود دو پرداخت هم‌زمان نتوانند از یک
        // مانده بیش از حد برداشت کنند (به‌روزرسانی خوش‌بینانه).
        const updated = await tx.walletAllocation.updateMany({
          where: { id: allocation.id, spent: allocation.spent },
          data: { spent: allocation.spent + BigInt(line.amount) },
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            'ماندهٔ کیف پول هم‌زمان تغییر کرد؛ لطفاً دوباره تلاش کنید',
          );
        }

        await tx.transaction.create({
          data: {
            type: 'PURCHASE',
            amount: BigInt(line.amount),
            employeeId,
            allocationId: allocation.id,
            storeId: store.id,
            paymentId: payment.id,
          },
        });

        receiptLines.push({
          walletName: allocation.definition.name,
          icon: allocation.definition.icon,
          amount: line.amount,
          remainingAfter: Number(remaining - BigInt(line.amount)),
        });
      }

      return {
        id: payment.id,
        receiptNo: payment.receiptNo,
        storeName: store.name,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        amount: Number(payment.amount),
        createdAt: payment.createdAt.toISOString(),
        lines: receiptLines,
      } satisfies Receipt;
    });

    // پنل فروشگاه بلافاصله رسید را می‌بیند — بدون ماندهٔ کیف‌پول‌های کارمند
    this.events.emit(store.id, {
      ...receipt,
      lines: receipt.lines.map((line) => ({
        walletName: line.walletName,
        icon: line.icon,
        amount: line.amount,
      })),
    });

    return receipt;
  }

  /** شمارهٔ رسید ۸ رقمی خوانا، با تلاش مجدد در صورت برخورد */
  private async nextReceiptNo(
    tx: Pick<PrismaService, 'payment'>,
  ): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = String(randomInt(10_000_000, 100_000_000));
      const clash = await tx.payment.findUnique({
        where: { receiptNo: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new BadRequestException('ثبت رسید ناموفق بود؛ دوباره تلاش کنید');
  }
}
