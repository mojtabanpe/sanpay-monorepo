import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  UpgIntentView,
  UpgLine,
  UpgPayResponse,
  UpgSource,
} from '@sanpay/models';
import { randomUUID } from 'node:crypto';
import {
  GatewayPayment,
  PaymentIntent,
  PaymentIntentPurpose,
  PaymentIntentStatus,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GatewayRegistry } from './gateways/gateway.registry';
import {
  GatewayCallback,
  GatewayInquiry,
  GatewayPaymentRef,
  GatewayVerified,
  PaymentGateway,
} from './gateways/payment-gateway';
import { WELFARE_DEFINITION, ensurePersonalWallet } from './personal-wallet';
import { CreateIntentInput, Tx, UpgError, UpgFulfiller } from './upg.types';

const DEFAULT_TTL_MS = 15 * 60_000;
/**
 * پرداختی که کاربر در درگاه رها کرده، بعد از انقضای intent تا این مدت هم
 * منتظر callback می‌ماند — بعضی کاربرها چند دقیقه در صفحهٔ بانک می‌مانند.
 */
const GATEWAY_GRACE_MS = 20 * 60_000;
const OPEN: PaymentIntentStatus[] = ['PENDING', 'AWAITING_GATEWAY'];
/** پرداخت بی‌callback از این سن به بعد از درگاه استعلام می‌شود */
const RECONCILE_AFTER_MS = 5 * 60_000;
/** فاصلهٔ دو استعلام یک پرداخت */
const RECONCILE_EVERY_MS = 3 * 60_000;
/** پرداختی که هرگز شناسهٔ درگاه نگرفت، بعد از این مدت بسته می‌شود */
const ORPHAN_AFTER_MS = 60 * 60_000;

/**
 * UPG — درگاه پرداخت یکپارچه (docs/upg.md).
 *
 * قاعدهٔ اصلی: **فقط این سرویس** `spent` کیف پول را برای خرید و برگشت تغییر
 * می‌دهد. سهم کارت اول به کیف پول شخصی (پنهان) واریز می‌شود و همان لحظه همراه
 * سهم اعتبار، در یک تراکنش دیتابیس، یک‌جا کسر می‌شود. اگر نهایی‌سازی خرید
 * شکست بخورد، همه‌چیز به منبع خودش برمی‌گردد — سهم کارت به کیف پول شخصی،
 * که کارمند می‌تواند به کارت برگرداند.
 */
@Injectable()
export class UpgService {
  private readonly logger = new Logger(UpgService.name);
  private readonly fulfillers = new Map<PaymentIntentPurpose, UpgFulfiller>();
  private expiring = false;
  private reconciling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewayRegistry,
  ) {}

  register(fulfiller: UpgFulfiller): void {
    this.fulfillers.set(fulfiller.purpose, fulfiller);
  }

  /** آدرس عمومی اپ کارمند — callback درگاه و صفحهٔ نتیجه زیر همین دامنه‌اند */
  get publicUrl(): string {
    return (process.env.UPG_PUBLIC_URL || 'http://localhost:6200').replace(
      /\/+$/,
      '',
    );
  }

  // ─── ساخت و نمایش ────────────────────────────────────────────────────────

  async createIntent(
    input: CreateIntentInput,
    tx: Tx = this.prisma,
  ): Promise<PaymentIntent> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('مبلغ پرداخت باید بیشتر از صفر باشد');
    }
    return tx.paymentIntent.create({
      data: {
        employeeId: input.employeeId,
        purpose: input.purpose,
        targetId: input.targetId,
        title: input.title,
        subtitle: input.subtitle ?? null,
        amount: BigInt(input.amount),
        allowedAllocationIds: input.allowedAllocationIds,
        storeId: input.storeId ?? null,
        merchantIntentId: input.merchantIntentId ?? null,
        expiresAt: new Date(Date.now() + (input.ttlMs ?? DEFAULT_TTL_MS)),
      },
    });
  }

  async view(employeeId: string, intentId: string): Promise<UpgIntentView> {
    const intent = await this.owned(employeeId, intentId);
    return this.toView(intent);
  }

  // ─── پرداخت ──────────────────────────────────────────────────────────────

  /**
   * کارمند تقسیم را انتخاب کرده. سهم هر منبع از `lines` و باقی‌مانده با کارت.
   * اگر سهم کارت صفر است همین‌جا کسر و نهایی می‌شود؛ وگرنه آدرس درگاه برمی‌گردد.
   */
  async pay(
    employeeId: string,
    intentId: string,
    lines: UpgLine[],
  ): Promise<UpgPayResponse> {
    const intent = await this.owned(employeeId, intentId);
    this.assertOpen(intent);

    const sources = await this.sourcesFor(intent);
    const plan = this.validatePlan(intent, sources, lines);
    const planned = plan.reduce((sum, line) => sum + line.amount, 0);
    const gatewayAmount = Number(intent.amount) - planned;

    if (gatewayAmount > 0 && !this.gateways.available) {
      throw new BadRequestException(
        'پرداخت با کارت فعلاً در دسترس نیست؛ کل مبلغ باید از اعتبار پرداخت شود',
      );
    }

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        plan: plan as unknown as Prisma.InputJsonValue,
        gatewayAmount: BigInt(gatewayAmount),
        failureReason: null,
      },
    });

    if (gatewayAmount === 0) {
      await this.settle(intent.id, OPEN);
      return { kind: 'done', intent: await this.view(employeeId, intentId) };
    }
    return this.startGateway(intent, gatewayAmount);
  }

  /**
   * تقسیم پیش‌فرض (اول اعتبار) را ذخیره می‌کند و اگر اعتبار کفاف داد، همین‌جا
   * پرداخت را نهایی می‌کند. برای پرداخت‌هایی که کارمند پشت اپ نیست — پرداخت
   * با OTP از پنل فروشگاه. اگر سهم کارت ماند، intent برای کارمند باز می‌ماند.
   */
  async settleWithCredit(intentId: string): Promise<{
    intent: PaymentIntent;
    creditAmount: number;
    cardAmount: number;
  }> {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: intentId },
    });
    const plan = this.suggest(intent, await this.sourcesFor(intent));
    const creditAmount = plan.reduce((sum, line) => sum + line.amount, 0);
    const cardAmount = Number(intent.amount) - creditAmount;

    await this.prisma.paymentIntent.update({
      where: { id: intent.id },
      data: {
        plan: plan as unknown as Prisma.InputJsonValue,
        gatewayAmount: BigInt(cardAmount),
      },
    });
    if (cardAmount === 0) {
      await this.settle(intent.id, OPEN);
    }
    return {
      intent: await this.prisma.paymentIntent.findUniqueOrThrow({
        where: { id: intent.id },
      }),
      creditAmount,
      cardAmount,
    };
  }

  async cancel(employeeId: string, intentId: string): Promise<UpgIntentView> {
    const intent = await this.owned(employeeId, intentId);
    const claimed = await this.prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: { in: OPEN } },
      data: { status: 'CANCELED' },
    });
    if (claimed.count === 1) {
      await this.abandon(intent);
    }
    return this.view(employeeId, intentId);
  }

  // ─── درگاه ───────────────────────────────────────────────────────────────

  private async startGateway(
    intent: PaymentIntent,
    amount: number,
  ): Promise<UpgPayResponse> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: intent.employeeId },
      select: { phone: true },
    });

    for (const gateway of this.gateways.candidates()) {
      const payment = await this.prisma.gatewayPayment.create({
        data: {
          intentId: intent.id,
          employeeId: intent.employeeId,
          gateway: gateway.key,
          trackerId: randomUUID(),
          amount: BigInt(amount),
        },
      });
      try {
        const created = await gateway.create({
          amountRial: amount * 10,
          trackerId: payment.trackerId,
          callbackUrl: `${this.publicUrl}/api/upg/callback/${gateway.key}`,
          mobile: employee.phone,
        });
        await this.prisma.gatewayPayment.update({
          where: { id: payment.id },
          data: {
            ref: created.ref,
            status: 'REDIRECTED',
            raw: json(created.raw),
          },
        });
        await this.prisma.paymentIntent.updateMany({
          where: { id: intent.id, status: { in: OPEN } },
          data: { status: 'AWAITING_GATEWAY' },
        });
        return { kind: 'redirect', url: created.redirectUrl };
      } catch (error) {
        this.logger.error(
          `ساخت پرداخت در درگاه ${gateway.key} شکست خورد — درگاه بعدی`,
          error instanceof Error ? error.stack : String(error),
        );
        await this.prisma.gatewayPayment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', error: messageOf(error) },
        });
      }
    }
    throw new ServiceUnavailableException(
      'درگاه پرداخت در دسترس نیست؛ کمی بعد دوباره تلاش کنید',
    );
  }

  /**
   * بازگشت کاربر از درگاه. به محتوای callback برای تصمیم اعتماد نمی‌شود: فقط
   * پرداخت ما را پیدا می‌کند و نتیجه از verify درگاه می‌آید. همیشه آدرسی
   * برمی‌گرداند که کاربر به آن هدایت شود.
   */
  async handleCallback(
    gatewayKey: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const home = `${this.publicUrl}/home`;
    const gateway = this.gateways.get(gatewayKey);
    if (!gateway) return home;

    const callback = gateway.parseCallback(body);
    const payment = callback.trackerId
      ? await this.prisma.gatewayPayment.findUnique({
          where: { trackerId: callback.trackerId },
        })
      : null;
    if (!payment || payment.gateway !== gateway.key) {
      this.logger.warn(`callback بدون پرداخت متناظر از ${gatewayKey}`);
      return home;
    }
    await this.resolvePayment(gateway, payment, callback);
    return `${this.publicUrl}/upg/${payment.intentId}/result`;
  }

  /**
   * تکلیف یک پرداخت باز (CREATED/REDIRECTED) را روشن می‌کند — از callback یا
   * از cron استعلام. verify فقط وقتی صدا زده می‌شود که intent هنوز منتظر
   * همین پرداخت است؛ وگرنه پرداخت بسته می‌شود و درگاه خودش پول را به کارت
   * برمی‌گرداند. `known` نتیجهٔ verifyشده‌ای است که استعلام از قبل فهمیده —
   * آن پول قطعاً گرفته شده، پس حتی برای intent بسته به کیف پول شخصی می‌رود.
   */
  private async resolvePayment(
    gateway: PaymentGateway,
    payment: GatewayPayment,
    callback: GatewayCallback | null,
    known?: GatewayVerified,
  ): Promise<void> {
    // callback تکراری یا refresh صفحه
    if (payment.status !== 'REDIRECTED' && payment.status !== 'CREATED') {
      return;
    }
    if (callback?.ref && payment.ref && callback.ref !== payment.ref) {
      await this.failGateway(payment, 'شناسهٔ پرداخت در callback مطابقت ندارد');
      return;
    }

    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: payment.intentId },
    });
    const waiting = await this.isWaitingFor(intent, payment);
    if (!waiting && !known?.ok) {
      // intent دیگر منتظر این پرداخت نیست (منقضی/لغو/تلاش تازه‌تر). verify
      // نمی‌کنیم تا درگاه خودش پول را به کارت برگرداند.
      await this.failGateway(
        payment,
        'درخواست پرداخت دیگر منتظر این پرداخت نبود؛ verify نشد',
      );
      return;
    }

    let verified: GatewayVerified;
    if (known) {
      verified = known;
    } else {
      try {
        verified = await gateway.verify(gatewayRef(payment), callback);
      } catch (error) {
        // پاسخ verify نرسید: نه می‌دانیم پول گرفته شد نه برعکس — بررسی دستی
        verified = {
          ok: false,
          unknown: true,
          amountRial: null,
          error: messageOf(error),
        };
      }
    }

    if (verified.pending) {
      // درگاه می‌گوید کاربر هنوز در بانک است، یا جوابی نرسید — cron استعلام
      // بعداً دوباره می‌پرسد
      this.logger.warn(
        `پرداخت ${payment.id} هنوز نزد درگاه باز است — به استعلام سپرده شد`,
      );
      return;
    }
    if (verified.unknown) {
      await this.markUnknown(
        payment,
        verified.error ?? 'وضعیت پرداخت نامعلوم است',
        verified.raw,
      );
      return;
    }
    if (!verified.ok) {
      await this.failGateway(
        payment,
        verified.error ?? 'پرداخت انجام نشد',
        verified.raw,
      );
      await this.reopenIntent(payment);
      return;
    }
    if (verified.amountRial !== Number(payment.amount) * 10) {
      // پول گرفته شده ولی مبلغش با ما نمی‌خواند — هیچ تصمیم خودکاری امن نیست
      await this.markUnknown(
        payment,
        `مبلغ تأییدشده (${verified.amountRial}) با مبلغ پرداخت مطابقت ندارد`,
        verified.raw,
      );
      return;
    }

    const toppedUp = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.gatewayPayment.updateMany({
        where: { id: payment.id, status: { in: ['CREATED', 'REDIRECTED'] } },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          psp: verified.psp ?? null,
          terminal: verified.terminal ?? null,
          traceNumber: verified.traceNumber ?? null,
          referenceNumber: verified.referenceNumber ?? null,
          maskedCard: verified.maskedCard ?? null,
          raw: json(verified.raw),
        },
      });
      if (claimed.count !== 1) return false;

      const personal = await ensurePersonalWallet(tx, payment.employeeId);
      await tx.walletAllocation.update({
        where: { id: personal.id },
        data: { cap: { increment: payment.amount } },
      });
      await tx.transaction.create({
        data: {
          type: 'TOPUP',
          amount: payment.amount,
          employeeId: payment.employeeId,
          allocationId: personal.id,
          intentId: intent.id,
          gatewayPaymentId: payment.id,
          note: `پرداخت با کارت — ${intent.title}`,
        },
      });
      return true;
    });

    if (toppedUp && waiting) {
      await this.settle(intent.id, ['AWAITING_GATEWAY']);
    } else if (toppedUp) {
      this.logger.warn(
        `پرداخت ${payment.id} بعد از بسته‌شدن intent تأیید شد — مبلغ در کیف پول شخصی ماند`,
      );
    }
  }

  /** intent در انتظار درگاه است و آخرین تلاشش همین پرداخت است */
  private async isWaitingFor(
    intent: PaymentIntent,
    payment: GatewayPayment,
  ): Promise<boolean> {
    if (intent.status !== 'AWAITING_GATEWAY') return false;
    const latest = await this.prisma.gatewayPayment.findFirst({
      where: { intentId: intent.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return latest?.id === payment.id;
  }

  private async failGateway(
    payment: GatewayPayment,
    error: string,
    raw?: unknown,
    status: 'FAILED' | 'EXPIRED' = 'FAILED',
  ): Promise<void> {
    await this.prisma.gatewayPayment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'REDIRECTED'] } },
      data: { status, error, raw: json(raw) },
    });
  }

  /** پرداخت کارتی نشد — کارمند می‌تواند دوباره تلاش کند */
  private async reopenIntent(payment: GatewayPayment): Promise<void> {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: payment.intentId },
    });
    if (!(await this.isWaitingFor(intent, payment))) return;
    await this.prisma.paymentIntent.updateMany({
      where: { id: intent.id, status: 'AWAITING_GATEWAY' },
      data: {
        status: 'PENDING',
        failureReason: 'پرداخت با کارت انجام نشد؛ دوباره تلاش کنید',
      },
    });
  }

  /**
   * نتیجه قطعی نیست — دستی بررسی می‌شود و هیچ cronی دوباره سراغش نمی‌رود.
   * شرطی است تا نتیجهٔ قطعیِ یک مسیر هم‌زمان (callback و استعلام) را پاک نکند.
   */
  private async markUnknown(
    payment: GatewayPayment,
    error: string,
    raw?: unknown,
  ): Promise<void> {
    const marked = await this.prisma.gatewayPayment.updateMany({
      where: { id: payment.id, status: { in: ['CREATED', 'REDIRECTED'] } },
      data: { status: 'UNKNOWN', error, raw: json(raw) },
    });
    if (marked.count === 1) {
      this.logger.error(`نتیجهٔ پرداخت ${payment.id} نامعلوم ماند — بررسی دستی: ${error}`);
    }
  }

  // ─── استعلام پرداخت‌های بی‌callback ────────────────────────────────────────

  /**
   * پرداخت‌هایی که callbackشان نرسید (کاربر مرورگر را بست، API پایین بود،
   * تومان کاربر را برنگرداند) از درگاه استعلام می‌شوند. «بازگشته ولی verify
   * نشده» مثل یک callback دیرهنگام رفتار می‌شود؛ «نامعلوم» خود درگاه (`-3`
   * تومان) و هر UNKNOWN ما فقط دستی بررسی می‌شود — نه تکرار، نه برگشت خودکار.
   */
  @Interval(60_000)
  async reconcileGateways(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const now = Date.now();
      const open = await this.prisma.gatewayPayment.findMany({
        where: {
          status: { in: ['CREATED', 'REDIRECTED'] },
          createdAt: { lt: new Date(now - RECONCILE_AFTER_MS) },
          OR: [
            { checkedAt: null },
            { checkedAt: { lt: new Date(now - RECONCILE_EVERY_MS) } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const payment of open) {
        await this.reconcile(payment).catch((error) =>
          this.logger.error(
            `استعلام پرداخت ${payment.id} شکست خورد`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
      }
    } finally {
      this.reconciling = false;
    }
  }

  private async reconcile(payment: GatewayPayment): Promise<void> {
    await this.prisma.gatewayPayment.update({
      where: { id: payment.id },
      data: { checkedAt: new Date() },
    });
    const gateway = this.gateways.get(payment.gateway);
    if (!gateway || !payment.ref) {
      // ساخت پرداخت نیمه‌کاره ماند (crash بین ثبت و پاسخ درگاه) — کاربر هرگز
      // به بانک نرفت
      if (payment.createdAt.getTime() < Date.now() - ORPHAN_AFTER_MS) {
        await this.failGateway(
          payment,
          'پرداخت هرگز به درگاه نرسید',
          undefined,
          'EXPIRED',
        );
        await this.reopenIntent(payment);
      }
      return;
    }

    let inquiry: GatewayInquiry;
    try {
      inquiry = await gateway.inquire(gatewayRef(payment));
    } catch (error) {
      this.logger.warn(
        `استعلام ${payment.gateway} برای ${payment.id} نرسید: ${messageOf(error)}`,
      );
      return;
    }

    switch (inquiry.state) {
      case 'pending':
        return;
      case 'returned':
        return this.resolvePayment(gateway, payment, null);
      case 'verified':
        return this.resolvePayment(gateway, payment, null, inquiry.verified);
      case 'failed':
      case 'expired':
        await this.failGateway(
          payment,
          inquiry.error ?? 'پرداخت انجام نشد',
          inquiry.raw,
          inquiry.state === 'expired' ? 'EXPIRED' : 'FAILED',
        );
        await this.reopenIntent(payment);
        return;
      case 'unknown':
        await this.markUnknown(
          payment,
          inquiry.error ?? 'وضعیت پرداخت نزد درگاه نامعلوم است',
          inquiry.raw,
        );
        return;
    }
  }

  // ─── کسر یک‌جا و نهایی‌سازی ──────────────────────────────────────────────

  /**
   * همهٔ سهم‌ها (اعتبار + کیف پول شخصی) در یک تراکنش کسر می‌شوند، بعد بخش
   * خرید نهایی می‌کند. اگر کسر شکست بخورد (مانده هم‌زمان تغییر کرد) intent به
   * PENDING برمی‌گردد و پول کارتی در کیف پول شخصی می‌ماند تا در تلاش بعدی
   * به‌عنوان منبع پیشنهاد شود. اگر نهایی‌سازی شکست بخورد، همه‌چیز برمی‌گردد.
   */
  private async settle(
    intentId: string,
    from: PaymentIntentStatus[],
  ): Promise<void> {
    let intent: PaymentIntent | null;
    try {
      intent = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.paymentIntent.updateMany({
          where: { id: intentId, status: { in: from } },
          data: { status: 'PROCESSING', failureReason: null },
        });
        if (claimed.count !== 1) return null;
        const current = await tx.paymentIntent.findUniqueOrThrow({
          where: { id: intentId },
        });
        await this.capture(tx, current);
        return current;
      });
    } catch (error) {
      await this.prisma.paymentIntent.updateMany({
        where: { id: intentId, status: { in: from } },
        data: {
          status: 'PENDING',
          failureReason: userMessage(
            error,
            'کسر مبلغ ممکن نشد؛ دوباره تلاش کنید',
          ),
        },
      });
      return;
    }
    if (!intent) return;

    const fulfiller = this.fulfillerOf(intent.purpose);
    try {
      await fulfiller.fulfill(intent);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(
        `نهایی‌سازی intent ${intent.id} (${intent.purpose}) شکست خورد — برگشت کامل`,
        error instanceof Error ? error.stack : String(error),
      );
      const reason = userMessage(error, 'خرید نهایی نشد؛ مبلغ برگشت داده شد');
      await this.refund(intent.id, 'all', reason);
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureReason: reason },
      });
    }
  }

  /** کسر خوش‌بینانهٔ هر سطر — دو پرداخت هم‌زمان نمی‌توانند از یک مانده بیش از حد بردارند */
  private async capture(tx: Tx, intent: PaymentIntent): Promise<void> {
    const amounts = new Map<string, bigint>();
    for (const line of (intent.plan ?? []) as unknown as UpgLine[]) {
      amounts.set(
        line.allocationId,
        (amounts.get(line.allocationId) ?? 0n) + BigInt(line.amount),
      );
    }
    if (intent.gatewayAmount > 0n) {
      const personal = await ensurePersonalWallet(tx, intent.employeeId);
      amounts.set(
        personal.id,
        (amounts.get(personal.id) ?? 0n) + intent.gatewayAmount,
      );
    }

    const total = [...amounts.values()].reduce((sum, value) => sum + value, 0n);
    if (total !== intent.amount) {
      throw new UpgError('جمع سهم‌ها با مبلغ پرداخت برابر نیست');
    }

    const now = new Date();
    for (const [allocationId, amount] of amounts) {
      const allocation = await tx.walletAllocation.findUnique({
        where: { id: allocationId },
        include: { definition: true },
      });
      const personal = allocation?.definition.kind === 'PERSONAL';
      if (
        !allocation ||
        allocation.employeeId !== intent.employeeId ||
        (!personal && !intent.allowedAllocationIds.includes(allocation.id))
      ) {
        throw new UpgError('کیف پول انتخاب‌شده برای این پرداخت مجاز نیست');
      }
      if (!allocation.isActive || !allocation.definition.isActive) {
        throw new UpgError(
          `کیف پول «${allocation.definition.name}» غیرفعال است`,
        );
      }
      if (allocation.expiresAt <= now) {
        throw new UpgError(
          `اعتبار کیف پول «${allocation.definition.name}» منقضی شده است`,
        );
      }
      if (allocation.cap - allocation.spent < amount) {
        throw new UpgError(
          personal
            ? 'ماندهٔ پرداخت کارتی کافی نیست'
            : `ماندهٔ کیف پول «${allocation.definition.name}» کافی نیست`,
        );
      }
      const updated = await tx.walletAllocation.updateMany({
        where: { id: allocation.id, spent: allocation.spent },
        data: { spent: allocation.spent + amount },
      });
      if (updated.count !== 1) {
        throw new UpgError(
          'ماندهٔ کیف پول هم‌زمان تغییر کرد؛ دوباره تلاش کنید',
        );
      }
      await tx.transaction.create({
        data: {
          type: 'PURCHASE',
          amount,
          employeeId: intent.employeeId,
          allocationId: allocation.id,
          storeId: intent.storeId,
          intentId: intent.id,
          note: intent.title,
        },
      });
    }
  }

  // ─── برگشت ───────────────────────────────────────────────────────────────

  /**
   * برگشت پول یک خرید به منابعش. اول کیف پول شخصی (پول خود کارمند)، بعد
   * کیف‌پول‌های رفاهی. هرگز بیشتر از خالص کسرشدهٔ این intent برنمی‌گردد،
   * پس تکرار بی‌خطر است — ولی idempotency «این برگشت قبلاً انجام شده» با
   * بخش خرید است (مثلاً `HotelBooking.refundedAmount`).
   *
   * @returns مبلغی که واقعاً برگشت (تومان)
   */
  async refund(
    intentId: string,
    amount: bigint | number | 'all',
    note: string,
    tx?: Tx,
  ): Promise<bigint> {
    const run = async (db: Tx): Promise<bigint> => {
      const rows = await db.transaction.findMany({
        where: { intentId, type: { in: ['PURCHASE', 'REFUND'] } },
        include: { allocation: { include: { definition: true } } },
        orderBy: { createdAt: 'asc' },
      });

      const net = new Map<
        string,
        { amount: bigint; personal: boolean; order: number }
      >();
      rows.forEach((row, order) => {
        const entry = net.get(row.allocationId) ?? {
          amount: 0n,
          personal: row.allocation.definition.kind === 'PERSONAL',
          order,
        };
        entry.amount += row.type === 'PURCHASE' ? row.amount : -row.amount;
        net.set(row.allocationId, entry);
      });

      const available = [...net.values()].reduce(
        (sum, entry) => sum + (entry.amount > 0n ? entry.amount : 0n),
        0n,
      );
      let wanted =
        amount === 'all'
          ? available
          : BigInt(amount) > available
            ? available
            : BigInt(amount);
      if (wanted <= 0n) return 0n;

      const ordered = [...net.entries()].sort(([, a], [, b]) =>
        a.personal !== b.personal ? (a.personal ? -1 : 1) : b.order - a.order,
      );

      let refunded = 0n;
      for (const [allocationId, entry] of ordered) {
        if (wanted <= 0n) break;
        if (entry.amount <= 0n) continue;
        const take = entry.amount < wanted ? entry.amount : wanted;
        const allocation = await db.walletAllocation.findUniqueOrThrow({
          where: { id: allocationId },
        });
        // spent هرگز نباید منفی شود؛ اگر شد یعنی جای دیگری حساب خراب است
        const back = take > allocation.spent ? allocation.spent : take;
        if (back <= 0n) continue;
        await db.walletAllocation.update({
          where: { id: allocationId },
          data: { spent: { decrement: back } },
        });
        await db.transaction.create({
          data: {
            type: 'REFUND',
            amount: back,
            employeeId: allocation.employeeId,
            allocationId,
            intentId,
            note,
          },
        });
        refunded += back;
        wanted -= back;
      }

      if (refunded > 0n) {
        await db.paymentIntent.update({
          where: { id: intentId },
          data: { refundedAmount: { increment: refunded } },
        });
      }
      return refunded;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * سهم هر منبع در یک خرید، برای رسیدهای بخش‌های خرید. نام کیف پول شخصی
   * («کارت بانکی») همان چیزی است که کارمند باید ببیند.
   */
  async paidSources(
    intentId: string,
  ): Promise<
    { name: string; icon: string | null; amount: number; personal: boolean }[]
  > {
    const rows = await this.prisma.transaction.findMany({
      where: { intentId, type: 'PURCHASE' },
      include: { allocation: { include: { definition: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      name: row.allocation.definition.name,
      icon: row.allocation.definition.icon,
      amount: Number(row.amount),
      personal: row.allocation.definition.kind === 'PERSONAL',
    }));
  }

  // ─── انقضا ───────────────────────────────────────────────────────────────

  @Interval(60_000)
  async expireStale(): Promise<void> {
    if (this.expiring) return;
    this.expiring = true;
    try {
      const now = Date.now();
      const stale = await this.prisma.paymentIntent.findMany({
        where: {
          OR: [
            { status: 'PENDING', expiresAt: { lt: new Date(now) } },
            {
              status: 'AWAITING_GATEWAY',
              expiresAt: { lt: new Date(now - GATEWAY_GRACE_MS) },
            },
          ],
        },
        take: 50,
      });
      for (const intent of stale) {
        const claimed = await this.prisma.paymentIntent.updateMany({
          where: { id: intent.id, status: intent.status },
          data: { status: 'EXPIRED' },
        });
        if (claimed.count !== 1) continue;
        // پرداخت‌های باز درگاه بسته نمی‌شوند: ممکن است پول گرفته شده باشد.
        // `reconcileGateways` از درگاه می‌پرسد و اگر verify شده بود، مبلغ به
        // کیف پول شخصی (قابل بازگشت) می‌رود.
        await this.abandon(intent);
      }
    } catch (error) {
      this.logger.error(
        'انقضای درخواست‌های پرداخت شکست خورد',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.expiring = false;
    }
  }

  // ─── کمکی‌ها ─────────────────────────────────────────────────────────────

  private async abandon(intent: PaymentIntent): Promise<void> {
    try {
      await this.fulfillerOf(intent.purpose).abandon(intent);
    } catch (error) {
      this.logger.error(
        `آزادسازی intent ${intent.id} شکست خورد`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private fulfillerOf(purpose: PaymentIntentPurpose): UpgFulfiller {
    const fulfiller = this.fulfillers.get(purpose);
    if (!fulfiller) {
      throw new Error(`هیچ fulfiller برای ${purpose} ثبت نشده است`);
    }
    return fulfiller;
  }

  private async owned(employeeId: string, intentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({
      where: { id: intentId },
    });
    if (!intent) throw new NotFoundException('درخواست پرداخت پیدا نشد');
    if (intent.employeeId !== employeeId) {
      throw new ForbiddenException('این درخواست پرداخت متعلق به شما نیست');
    }
    return intent;
  }

  private assertOpen(intent: PaymentIntent): void {
    if (!OPEN.includes(intent.status)) {
      throw new BadRequestException('این درخواست پرداخت دیگر باز نیست');
    }
    if (intent.expiresAt <= new Date()) {
      throw new BadRequestException(
        'مهلت این پرداخت تمام شده؛ دوباره از ابتدا اقدام کنید',
      );
    }
  }

  /**
   * منابع قابل استفاده: کیف‌پول‌های رفاهیِ مجاز با مانده (زودانقضاترین اول)،
   * و ماندهٔ کیف پول شخصی اگر از پرداخت کارتی قبلی چیزی برگشته باشد.
   */
  private async sourcesFor(intent: PaymentIntent): Promise<UpgSource[]> {
    const now = new Date();
    const [welfare, personal] = await Promise.all([
      this.prisma.walletAllocation.findMany({
        where: {
          id: { in: intent.allowedAllocationIds },
          employeeId: intent.employeeId,
          isActive: true,
          expiresAt: { gt: now },
          definition: { ...WELFARE_DEFINITION, isActive: true },
        },
        include: { definition: true },
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.walletAllocation.findFirst({
        where: {
          employeeId: intent.employeeId,
          definition: { kind: 'PERSONAL' },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const sources: UpgSource[] = welfare
      .map((allocation) => ({
        allocationId: allocation.id,
        name: allocation.definition.name,
        icon: allocation.definition.icon,
        max: Number(allocation.cap - allocation.spent),
        kind: 'WELFARE' as const,
      }))
      .filter((source) => source.max > 0);

    if (personal && personal.cap - personal.spent > 0n) {
      sources.push({
        allocationId: personal.id,
        name: 'مانده از پرداخت‌های کارتی قبلی',
        icon: 'card',
        max: Number(personal.cap - personal.spent),
        kind: 'PERSONAL',
      });
    }
    return sources;
  }

  /** «اول اعتبار»: هر منبع تا سقفش، به ترتیب، تا مبلغ پر شود */
  private suggest(intent: PaymentIntent, sources: UpgSource[]): UpgLine[] {
    let remaining = Number(intent.amount);
    const lines: UpgLine[] = [];
    for (const source of sources) {
      if (remaining <= 0) break;
      const amount = Math.min(source.max, remaining);
      lines.push({ allocationId: source.allocationId, amount });
      remaining -= amount;
    }
    return lines;
  }

  private validatePlan(
    intent: PaymentIntent,
    sources: UpgSource[],
    lines: UpgLine[],
  ): UpgLine[] {
    const plan = lines.filter((line) => line.amount > 0);
    const seen = new Set<string>();
    let total = 0;
    for (const line of plan) {
      if (!Number.isSafeInteger(line.amount)) {
        throw new BadRequestException('مبلغ باید عدد صحیح باشد');
      }
      if (seen.has(line.allocationId)) {
        throw new BadRequestException('هر کیف پول فقط یک‌بار قابل انتخاب است');
      }
      seen.add(line.allocationId);
      const source = sources.find((s) => s.allocationId === line.allocationId);
      if (!source) {
        throw new BadRequestException(
          'کیف پول انتخاب‌شده برای این پرداخت مجاز نیست',
        );
      }
      if (line.amount > source.max) {
        throw new BadRequestException(
          `مبلغ واردشده از ماندهٔ «${source.name}» بیشتر است`,
        );
      }
      total += line.amount;
    }
    if (total > Number(intent.amount)) {
      throw new BadRequestException('جمع مبالغ از مبلغ پرداخت بیشتر است');
    }
    return plan;
  }

  private async toView(intent: PaymentIntent): Promise<UpgIntentView> {
    const open = OPEN.includes(intent.status);
    const sources = open ? await this.sourcesFor(intent) : [];
    const lastGateway = await this.prisma.gatewayPayment.findFirst({
      where: { intentId: intent.id },
      orderBy: { createdAt: 'desc' },
    });
    const fulfiller = this.fulfillerOf(intent.purpose);
    let result = null;
    if (intent.status === 'COMPLETED') {
      result = await fulfiller.result(intent).catch((error) => {
        this.logger.error(
          `ساخت نتیجهٔ intent ${intent.id} شکست خورد`,
          error instanceof Error ? error.stack : String(error),
        );
        return null;
      });
    }
    return {
      id: intent.id,
      purpose: intent.purpose,
      status: intent.status,
      title: intent.title,
      subtitle: intent.subtitle,
      amount: Number(intent.amount),
      gatewayAmount: Number(intent.gatewayAmount),
      failureReason: intent.failureReason,
      expiresAt: intent.expiresAt.toISOString(),
      sources,
      suggested: open ? this.suggest(intent, sources) : [],
      cardAvailable: this.gateways.available,
      gateway: lastGateway
        ? {
            amount: Number(lastGateway.amount),
            status: lastGateway.status,
            traceNumber: lastGateway.traceNumber,
            referenceNumber: lastGateway.referenceNumber,
            terminal: lastGateway.terminal,
            maskedCard: lastGateway.maskedCard,
          }
        : null,
      result,
      backPath: fulfiller.backPath(intent),
    };
  }
}

export function gatewayRef(payment: GatewayPayment): GatewayPaymentRef {
  return {
    ref: payment.ref ?? '',
    trackerId: payment.trackerId,
    amountRial: Number(payment.amount) * 10,
    createdAt: payment.createdAt,
  };
}

function json(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** پیام خطاهایی که برای کارمند نوشته شده‌اند؛ بقیه با پیام عمومی جایگزین می‌شوند */
function userMessage(error: unknown, fallback: string): string {
  if (error instanceof UpgError) return error.message;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : (response as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message) && typeof message[0] === 'string')
      return message[0];
  }
  return fallback;
}
