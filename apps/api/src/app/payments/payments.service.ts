import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Receipt, StoreCheckout } from '@sanpay/models';
import { randomInt } from 'node:crypto';
import { PaymentIntent, Prisma } from '../../generated/prisma/client';
import { SmsService } from '../auth/sms.service';
import { PrismaService } from '../prisma/prisma.service';
import { WELFARE_DEFINITION } from '../upg/personal-wallet';
import { UpgService } from '../upg/upg.service';
import { PaymentEventsService } from './payment-events.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PaymentEventsService,
    private readonly sms: SmsService,
    private readonly upg: UpgService,
  ) {}

  /**
   * بعد از اسکن QR فروشگاه: فروشگاه + کیف‌پول‌هایی که این کارمند می‌تواند در آن
   * خرج کند، هرکدام با سقف قابل برداشت. کلاینت از روی همین سقف‌ها ورودی مبلغ را
   * محدود می‌کند.
   */
  async checkout(
    employeeId: string,
    storeCode: string,
  ): Promise<StoreCheckout> {
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
          ...WELFARE_DEFINITION,
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
   * شروع پرداخت فروشگاهی: کارمند مبلغ کل را وارد کرده و از اینجا به UPG
   * می‌رود. کیف‌پول‌های مرتبط با فروشگاه منابع مجازند؛ کسر پول و ثبت رسید با
   * UPG است (`StorePaymentFulfiller`).
   */
  async startPayment(
    employeeId: string,
    input: { storeCode: string; amount: number },
    merchantIntentId?: string,
  ): Promise<PaymentIntent> {
    const store = await this.prisma.store.findUnique({
      where: { code: input.storeCode.trim().toUpperCase() },
    });
    if (!store || !store.isActive) {
      throw new NotFoundException('فروشگاهی با این کد پیدا نشد');
    }
    const allocations = await this.prisma.walletAllocation.findMany({
      where: {
        employeeId,
        definition: {
          ...WELFARE_DEFINITION,
          stores: { some: { storeId: store.id } },
        },
      },
      select: { id: true },
    });
    return this.upg.createIntent({
      employeeId,
      purpose: 'STORE',
      targetId: store.id,
      storeId: store.id,
      title: store.name,
      subtitle: store.category,
      amount: input.amount,
      allowedAllocationIds: allocations.map((allocation) => allocation.id),
      merchantIntentId,
    });
  }

  /**
   * ثبت رسید بعد از اینکه UPG کل مبلغ را کسر کرد. تراکنش‌های خرید از قبل با
   * همین intent وجود دارند و اینجا فقط به رسید وصل می‌شوند.
   */
  async completeFromIntent(intent: PaymentIntent): Promise<void> {
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: intent.targetId },
    });
    if (!store.isActive) {
      throw new BadRequestException('فروشگاه غیرفعال شده است');
    }

    const paymentId = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          receiptNo: await this.nextReceiptNo(tx),
          employeeId: intent.employeeId,
          storeId: store.id,
          amount: intent.amount,
          intentId: intent.id,
          merchantIntentId: intent.merchantIntentId,
        },
      });
      await tx.transaction.updateMany({
        where: { intentId: intent.id, type: 'PURCHASE' },
        data: { paymentId: payment.id, storeId: store.id },
      });
      return payment.id;
    });

    const receipt = await this.employeeReceipt(paymentId);

    // پنل فروشگاه بلافاصله رسید را می‌بیند — بدون ماندهٔ کیف‌پول‌های کارمند
    this.events.emit(store.id, await this.receipt(paymentId));

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: intent.employeeId },
      select: { phone: true },
    });
    if (employee.phone) {
      this.sms.sendPaymentNotices(
        employee.phone,
        store.name,
        receipt.lines.flatMap((line) =>
          line.remainingAfter === undefined
            ? []
            : [{ ...line, remainingAfter: line.remainingAfter }],
        ),
      );
    }
  }

  /** رسید پرداخت یک intent — برای صفحهٔ نتیجهٔ UPG */
  async receiptForIntent(intentId: string): Promise<Receipt> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { intentId },
      select: { id: true },
    });
    return this.employeeReceipt(payment.id);
  }

  /**
   * رسید با ماندهٔ فعلی هر کیف پول رفاهی — فقط برای خود کارمند. سطر کارت
   * بانکی مانده ندارد.
   */
  private async employeeReceipt(paymentId: string): Promise<Receipt> {
    const receipt = await this.receipt(paymentId);
    const rows = await this.prisma.transaction.findMany({
      where: { paymentId },
      include: { allocation: { include: { definition: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...receipt,
      lines: rows.map((row) => ({
        walletName: row.allocation.definition.name,
        icon: row.allocation.definition.icon,
        amount: Number(row.amount),
        ...(row.allocation.definition.kind === 'PERSONAL'
          ? {}
          : {
              remainingAfter: Number(row.allocation.cap - row.allocation.spent),
            }),
      })),
    };
  }

  async receipt(paymentId: string): Promise<Receipt> {
    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        employee: true,
        store: true,
        transactions: {
          where: { type: 'PURCHASE' },
          include: { allocation: { include: { definition: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return {
      id: payment.id,
      receiptNo: payment.receiptNo,
      storeName: payment.store.name,
      employeeName: `${payment.employee.firstName} ${payment.employee.lastName}`,
      amount: Number(payment.amount),
      createdAt: payment.createdAt.toISOString(),
      merchantIntentId: payment.merchantIntentId,
      lines: payment.transactions.map((transaction) => ({
        walletName: transaction.allocation.definition.name,
        icon: transaction.allocation.definition.icon,
        amount: Number(transaction.amount),
      })),
    };
  }

  /** شمارهٔ رسید ۸ رقمی خوانا، با تلاش مجدد در صورت برخورد */
  private async nextReceiptNo(
    tx: Pick<Prisma.TransactionClient, 'payment'>,
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
