import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { CardRefundSummary } from '@sanpay/models';
import { randomUUID } from 'node:crypto';
import {
  GatewayPayment,
  GatewayRefund,
  GatewayRefundStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GatewayRegistry } from './gateways/gateway.registry';
import {
  GatewayRefundResult,
  PaymentGateway,
} from './gateways/payment-gateway';
import { ensurePersonalWallet } from './personal-wallet';
import { gatewayRef } from './upg.service';

/** وضعیت‌هایی که هنوز پیگیری می‌شوند */
const OPEN: GatewayRefundStatus[] = ['SUBMITTING', 'PENDING', 'UNKNOWN'];
/**
 * کمترین مبلغ یک درخواست (تومان) — مگر کل مانده کمتر باشد. هر بازگشت
 * کارمزد تومان دارد؛ بدون کف، چند درخواست یک‌تومانی هزینهٔ واقعی می‌سازد.
 */
const MIN_REFUND = 1_000;
/** بازگشت تازه را cron تا این مدت دست نمی‌زند — درخواست ثبتش هنوز در راه است */
const SUBMIT_GRACE_MS = 60_000;
const POLL_EVERY_MS = 2 * 60_000;
const RECENT = 10;

type PaymentGatewayWithRefund = PaymentGateway &
  Required<Pick<PaymentGateway, 'refund' | 'refundStatus'>>;

/**
 * «بازگشت پول» پروفایل: ماندهٔ کیف پول شخصی (پنهان) به همان کارت‌هایی
 * برمی‌گردد که با آن‌ها پرداخت شده بود (docs/upg.md).
 *
 * - مبلغ بین پرداخت‌های VERIFIED کارمند، قدیمی‌ترین اول، پخش می‌شود؛ هر سهم
 *   حداکثر «مبلغ پرداخت − بازگشت‌های قبلی».
 * - کیف پول شخصی همان لحظه کسر می‌شود (`WITHDRAWAL`) و سهم هر پرداخت در
 *   `refundedAmount` رزرو می‌شود، پس دو درخواست هم‌زمان نمی‌توانند بیش از
 *   مانده یا بیش از مبلغ یک پرداخت برگردانند.
 * - بازگشتی که به Failed/Denied برسد، مبلغش به مانده برمی‌گردد (`TOPUP`).
 *   Pending/Unknown تا وضعیت نهایی پیگیری می‌شوند.
 */
@Injectable()
export class CardRefundService {
  private readonly logger = new Logger(CardRefundService.name);
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewayRegistry,
  ) {}

  async summary(employeeId: string): Promise<CardRefundSummary> {
    const [personal, payments, refunds] = await Promise.all([
      this.personalWallet(employeeId),
      this.refundablePayments(this.prisma, employeeId),
      this.prisma.gatewayRefund.findMany({
        where: { employeeId },
        include: { gatewayPayment: { select: { maskedCard: true } } },
        orderBy: { createdAt: 'desc' },
        take: RECENT,
      }),
    ]);
    const balance = personal ? Number(personal.cap - personal.spent) : 0;
    const room = payments.reduce(
      (sum, payment) => sum + Number(payment.amount - payment.refundedAmount),
      0,
    );
    return {
      balance,
      refundable: Math.min(balance, room),
      minimum: MIN_REFUND,
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: Number(refund.amount),
        status: refund.status,
        maskedCard: refund.gatewayPayment.maskedCard,
        createdAt: refund.createdAt.toISOString(),
        completedAt: refund.completedAt?.toISOString() ?? null,
      })),
    };
  }

  /** @param amount تومان */
  async request(employeeId: string, amount: number): Promise<CardRefundSummary> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ بازگشت باید بیشتر از صفر باشد');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const personal = await ensurePersonalWallet(tx, employeeId);
      const balance = personal.cap - personal.spent;
      const wanted = BigInt(amount);
      if (wanted > balance) {
        throw new BadRequestException('مبلغ از ماندهٔ قابل بازگشت بیشتر است');
      }
      if (amount < MIN_REFUND && wanted !== balance) {
        throw new BadRequestException(
          'مبلغ بازگشت دست‌کم ۱۰٬۰۰۰ ریال است، مگر کل مانده کمتر باشد',
        );
      }

      const payments = await this.refundablePayments(tx, employeeId);
      const parts: { payment: GatewayPayment; refund: GatewayRefund }[] = [];
      let remaining = wanted;
      for (const payment of payments) {
        if (remaining <= 0n) break;
        const room = payment.amount - payment.refundedAmount;
        const gateway = this.gateways.get(payment.gateway) as PaymentGateway;
        const take = room < remaining ? room : remaining;
        // درگاهی که بازگشت جزئی ندارد فقط کل مانده‌ی یک پرداخت را برمی‌گرداند
        if (!gateway.capabilities.partialRefund && take !== payment.amount) {
          continue;
        }

        const reserved = await tx.gatewayPayment.updateMany({
          where: { id: payment.id, refundedAmount: payment.refundedAmount },
          data: { refundedAmount: payment.refundedAmount + take },
        });
        if (reserved.count !== 1) {
          throw new ConflictException(
            'درخواست بازگشت هم‌زمان دیگری در جریان است؛ دوباره تلاش کنید',
          );
        }
        const refund = await tx.gatewayRefund.create({
          data: {
            gatewayPaymentId: payment.id,
            employeeId,
            gateway: payment.gateway,
            amount: take,
            trackerId: randomUUID(),
          },
        });
        await tx.transaction.create({
          data: {
            type: 'WITHDRAWAL',
            amount: take,
            employeeId,
            allocationId: personal.id,
            gatewayRefundId: refund.id,
            note: 'بازگشت پول به کارت',
          },
        });
        parts.push({ payment, refund });
        remaining -= take;
      }
      if (remaining > 0n) {
        throw new BadRequestException(
          'این مبلغ از طریق درگاه قابل بازگشت به کارت نیست؛ با واحد رفاه تماس بگیرید',
        );
      }

      // کسر خوش‌بینانه: اگر مانده هم‌زمان عوض شد (خرید یا بازگشت دیگر)، کل تراکنش برمی‌گردد
      const debited = await tx.walletAllocation.updateMany({
        where: { id: personal.id, cap: personal.cap, spent: personal.spent },
        data: { cap: personal.cap - wanted },
      });
      if (debited.count !== 1) {
        throw new ConflictException(
          'مانده هم‌زمان تغییر کرد؛ دوباره تلاش کنید',
        );
      }
      return parts;
    });

    for (const { payment, refund } of created) {
      await this.submit(refund, payment).catch((error) =>
        this.logger.error(
          `ثبت بازگشت ${refund.id} شکست خورد — با استعلام پیگیری می‌شود`,
          error instanceof Error ? error.stack : String(error),
        ),
      );
    }
    return this.summary(employeeId);
  }

  // ─── پیگیری ──────────────────────────────────────────────────────────────

  @Interval(60_000)
  async pollRefunds(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const now = Date.now();
      const open = await this.prisma.gatewayRefund.findMany({
        where: {
          status: { in: OPEN },
          createdAt: { lt: new Date(now - SUBMIT_GRACE_MS) },
          OR: [
            { checkedAt: null },
            { checkedAt: { lt: new Date(now - POLL_EVERY_MS) } },
          ],
        },
        include: { gatewayPayment: true },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const refund of open) {
        await this.check(refund, refund.gatewayPayment).catch((error) =>
          this.logger.error(
            `پیگیری بازگشت ${refund.id} شکست خورد`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
      }
    } finally {
      this.polling = false;
    }
  }

  private async check(
    refund: GatewayRefund,
    payment: GatewayPayment,
  ): Promise<void> {
    await this.prisma.gatewayRefund.update({
      where: { id: refund.id },
      data: { checkedAt: new Date() },
    });
    const gateway = this.refundGateway(refund.gateway);
    if (!gateway) return;
    const result = await gateway.refundStatus(this.ref(refund, payment));

    if (result.state === 'missing') {
      if (refund.status === 'SUBMITTING') {
        // درخواست ثبت هرگز به درگاه نرسید — با همان tracker دوباره؛ اگر رسیده
        // بود، درگاه tracker تکراری را رد می‌کند و دفعهٔ بعد پیدایش می‌کنیم
        return this.submit(refund, payment);
      }
      this.logger.error(
        `بازگشت ${refund.id} (${refund.status}) نزد درگاه پیدا نشد — بررسی دستی`,
      );
      return;
    }
    await this.apply(refund, result);
  }

  private async submit(
    refund: GatewayRefund,
    payment: GatewayPayment,
  ): Promise<void> {
    const gateway = this.refundGateway(refund.gateway);
    if (!gateway) return;
    let result: GatewayRefundResult;
    try {
      result = await gateway.refund(this.ref(refund, payment));
    } catch (error) {
      result = {
        state: 'unreachable',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    await this.apply(refund, result);
  }

  private async apply(
    refund: GatewayRefund,
    result: GatewayRefundResult,
  ): Promise<void> {
    const raw = json(result.raw);
    switch (result.state) {
      case 'succeeded':
        await this.prisma.gatewayRefund.updateMany({
          where: { id: refund.id, status: { in: OPEN } },
          data: {
            status: 'SUCCEEDED',
            ref: result.ref ?? refund.ref,
            raw,
            error: null,
            completedAt: new Date(),
          },
        });
        return;
      case 'pending':
        await this.prisma.gatewayRefund.updateMany({
          where: { id: refund.id, status: { in: OPEN } },
          data: {
            status: result.unknown ? 'UNKNOWN' : 'PENDING',
            ref: result.ref ?? refund.ref,
            raw,
          },
        });
        return;
      case 'failed':
      case 'denied':
        return this.creditBack(
          refund,
          result.state === 'denied' ? 'DENIED' : 'FAILED',
          result.error ?? 'بازگشت به کارت انجام نشد',
          result.ref ?? refund.ref,
          raw,
        );
      // unreachable / missing: وضعیت عوض نمی‌شود، استعلام بعدی
      default:
        if (result.error) {
          await this.prisma.gatewayRefund.updateMany({
            where: { id: refund.id, status: { in: OPEN } },
            data: { error: result.error },
          });
        }
    }
  }

  /** پولی به کارت نرفت: سهم رزروشدهٔ پرداخت آزاد و مبلغ به مانده برمی‌گردد */
  private async creditBack(
    refund: GatewayRefund,
    status: 'FAILED' | 'DENIED',
    error: string,
    ref: string | null,
    raw: Prisma.InputJsonValue | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.gatewayRefund.updateMany({
        where: { id: refund.id, status: { in: OPEN } },
        data: { status, error, ref, raw, completedAt: new Date() },
      });
      if (claimed.count !== 1) return;

      await tx.gatewayPayment.update({
        where: { id: refund.gatewayPaymentId },
        data: { refundedAmount: { decrement: refund.amount } },
      });
      const personal = await ensurePersonalWallet(tx, refund.employeeId);
      await tx.walletAllocation.update({
        where: { id: personal.id },
        data: { cap: { increment: refund.amount } },
      });
      await tx.transaction.create({
        data: {
          type: 'TOPUP',
          amount: refund.amount,
          employeeId: refund.employeeId,
          allocationId: personal.id,
          gatewayRefundId: refund.id,
          note: 'بازگشت به کارت انجام نشد — مبلغ به مانده برگشت',
        },
      });
    });
    this.logger.warn(`بازگشت ${refund.id} ${status}: ${error}`);
  }

  // ─── کمکی‌ها ─────────────────────────────────────────────────────────────

  private personalWallet(employeeId: string) {
    return this.prisma.walletAllocation.findFirst({
      where: { employeeId, definition: { kind: 'PERSONAL' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * پرداخت‌های تأییدشده با جای بازگشت، روی درگاه‌هایی که refund دارند —
   * قدیمی‌ترین اول. پرداختی که بازگشتش یک‌بار FAILED شد (مثلاً کارت باطل
   * شده) کنار می‌رود؛ وگرنه هر تلاش بعدی دوباره اول سراغ همان می‌رفت و
   * هرگز به پرداخت‌های دیگر نمی‌رسید. DENIED (خالی بودن کیف پول بازگشت ما)
   * گذراست و پرداخت را کنار نمی‌گذارد.
   */
  private async refundablePayments(
    db: Prisma.TransactionClient,
    employeeId: string,
  ): Promise<GatewayPayment[]> {
    const keys = this.gateways
      .all()
      .filter((gateway) => this.refundGateway(gateway.key))
      .map((gateway) => gateway.key);
    const payments = await db.gatewayPayment.findMany({
      where: {
        employeeId,
        status: 'VERIFIED',
        gateway: { in: keys },
        refunds: { none: { status: 'FAILED' } },
      },
      orderBy: [{ verifiedAt: 'asc' }, { createdAt: 'asc' }],
    });
    return payments.filter((payment) => payment.amount > payment.refundedAmount);
  }

  private refundGateway(key: string): PaymentGatewayWithRefund | null {
    const gateway = this.gateways.get(key);
    return gateway?.capabilities.refund && gateway.refund && gateway.refundStatus
      ? (gateway as PaymentGatewayWithRefund)
      : null;
  }

  private ref(refund: GatewayRefund, payment: GatewayPayment) {
    return {
      payment: gatewayRef(payment),
      trackerId: refund.trackerId,
      ref: refund.ref,
      amountRial: Number(refund.amount) * 10,
    };
  }
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}
