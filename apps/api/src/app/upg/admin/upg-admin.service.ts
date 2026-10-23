import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminGatewayPaymentDetail,
  AdminGatewayPaymentRow,
  AdminGatewayRefundRow,
  AdminRefundWallet,
  AdminUpgInquiry,
  AdminUpgReviewCount,
  AdminUpgReviewQueue,
  AdminUpgSettings,
  Paginated,
} from '@sanpay/models';
import { GatewayReviewAction, Prisma } from '../../../generated/prisma/client';
import { AdminJwtPayload } from '../../admin/admin-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { tomanCredentialsFromEnv } from '../../toman/toman-oauth';
import { CardRefundService } from '../card-refund.service';
import { GatewayRegistry } from '../gateways/gateway.registry';
import { TomanIpgHttpClient } from '../gateways/toman/toman-ipg-http.client';
import { UpgService } from '../upg.service';
import { GatewayPaymentQueryDto, UpgReviewDto } from './upg-admin.dto';

/** بازگشت SUBMITTING بعد از این مدت «گیرکرده» است — cron هر ۲ دقیقه می‌پرسد */
const STUCK_SUBMITTING_MINUTES = 15;
/** PENDING تا پایان چرخهٔ تسویهٔ بانک عادی است */
const STUCK_PENDING_DAYS = 3;
/** کف پیش‌فرض هشدار کیف پول بازگشت (تومان) — `UPG_REFUND_WALLET_MIN` */
const REFUND_WALLET_MIN = 5_000_000;
const DENIED_WINDOW_MS = 7 * 24 * 60 * 60_000;

/** پرداخت‌هایی که هیچ cronی تکلیفشان را روشن نمی‌کند */
const QUEUED_PAYMENTS = {
  status: 'UNKNOWN',
} satisfies Prisma.GatewayPaymentWhereInput;

/** بازگشت‌های نامعلوم یا گیرکرده — آستانه‌ها نسبت به همین لحظه */
function queuedRefunds(): Prisma.GatewayRefundWhereInput {
  const now = Date.now();
  return {
    OR: [
      { status: 'UNKNOWN' },
      {
        status: 'SUBMITTING',
        createdAt: { lt: new Date(now - STUCK_SUBMITTING_MINUTES * 60_000) },
      },
      {
        status: 'PENDING',
        createdAt: {
          lt: new Date(now - STUCK_PENDING_DAYS * 24 * 60 * 60_000),
        },
      },
    ],
  };
}

const employeeSelect = {
  id: true,
  firstName: true,
  lastName: true,
  personnelCode: true,
  nationalCode: true,
} satisfies Prisma.EmployeeSelect;

const paymentRowInclude = {
  employee: { select: employeeSelect },
  intent: { select: { id: true, purpose: true, title: true } },
} satisfies Prisma.GatewayPaymentInclude;

const refundRowInclude = {
  employee: { select: employeeSelect },
  gatewayPayment: { select: { maskedCard: true } },
} satisfies Prisma.GatewayRefundInclude;

type PaymentRowSource = Prisma.GatewayPaymentGetPayload<{
  include: typeof paymentRowInclude;
}>;
type RefundRowSource = Prisma.GatewayRefundGetPayload<{
  include: typeof refundRowInclude;
}>;

/**
 * UPG در داشبورد (docs/upg.md، فاز ۳): فهرست و جزئیات پرداخت‌های درگاه، صف
 * بررسی دستی، موجودی کیف پول بازگشت و نمایش پیکربندی درگاه‌ها.
 *
 * این سرویس خودش پولی جابه‌جا نمی‌کند: تصمیم‌های دستی به
 * `UpgService.resolveUnknownPayment` و `CardRefundService.resolveManually`
 * سپرده می‌شوند — همان کدهایی که callback و cron استفاده می‌کنند — و این‌جا
 * فقط یادداشت حسابرسی (`GatewayReview`) در همان تراکنش نوشته می‌شود.
 */
@Injectable()
export class UpgAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateways: GatewayRegistry,
    private readonly upg: UpgService,
    private readonly cardRefunds: CardRefundService,
  ) {}

  // ─── پرداخت‌های درگاه ─────────────────────────────────────────────────────

  async payments(
    query: GatewayPaymentQueryDto,
  ): Promise<Paginated<AdminGatewayPaymentRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where = this.paymentWhere(query);
    const [total, rows] = await Promise.all([
      this.prisma.gatewayPayment.count({ where }),
      this.prisma.gatewayPayment.findMany({
        where,
        include: paymentRowInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => this.paymentRow(row)),
      total,
      page,
      pageSize,
    };
  }

  async payment(id: string): Promise<AdminGatewayPaymentDetail> {
    const payment = await this.prisma.gatewayPayment.findUnique({
      where: { id },
      include: {
        ...paymentRowInclude,
        intent: {
          include: {
            gatewayPayments: {
              select: {
                id: true,
                gateway: true,
                status: true,
                amount: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        refunds: { include: refundRowInclude, orderBy: { createdAt: 'desc' } },
        reviews: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!payment) throw new NotFoundException('پرداخت درگاه پیدا نشد');

    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [
          { gatewayPaymentId: payment.id },
          { intentId: payment.intentId },
          { gatewayRefundId: { in: payment.refunds.map((r) => r.id) } },
        ],
      },
      include: { allocation: { include: { definition: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const { intent } = payment;
    return {
      ...this.paymentRow(payment),
      psp: payment.psp,
      terminal: payment.terminal,
      referenceNumber: payment.referenceNumber,
      raw: payment.raw ?? null,
      checkedAt: payment.checkedAt?.toISOString() ?? null,
      updatedAt: payment.updatedAt.toISOString(),
      intent: {
        id: intent.id,
        purpose: intent.purpose,
        title: intent.title,
        status: intent.status,
        amount: Number(intent.amount),
        gatewayAmount: Number(intent.gatewayAmount),
        refundedAmount: Number(intent.refundedAmount),
        failureReason: intent.failureReason,
        createdAt: intent.createdAt.toISOString(),
        completedAt: intent.completedAt?.toISOString() ?? null,
        attempts: intent.gatewayPayments.map((attempt) => ({
          id: attempt.id,
          gateway: attempt.gateway,
          status: attempt.status,
          amount: Number(attempt.amount),
          createdAt: attempt.createdAt.toISOString(),
        })),
      },
      refunds: payment.refunds.map((refund) => this.refundRow(refund)),
      transactions: transactions.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        walletName: row.allocation.definition.name,
        personal: row.allocation.definition.kind === 'PERSONAL',
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      reviews: payment.reviews.map((review) => ({
        id: review.id,
        action: review.action,
        gatewayRefundId: review.gatewayRefundId,
        fromStatus: review.fromStatus,
        note: review.note,
        adminUsername: review.adminUsername,
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }

  // ─── صف بررسی دستی ───────────────────────────────────────────────────────

  async queue(): Promise<AdminUpgReviewQueue> {
    const [payments, refunds] = await Promise.all([
      this.prisma.gatewayPayment.findMany({
        where: QUEUED_PAYMENTS,
        include: paymentRowInclude,
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
      this.prisma.gatewayRefund.findMany({
        where: queuedRefunds(),
        include: refundRowInclude,
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    ]);
    return {
      payments: payments.map((row) => this.paymentRow(row)),
      refunds: refunds.map((row) => this.refundRow(row)),
      stuck: {
        submittingMinutes: STUCK_SUBMITTING_MINUTES,
        pendingDays: STUCK_PENDING_DAYS,
      },
    };
  }

  /** فقط تعداد صف — برای شمارندهٔ منوی داشبورد، که با هر جابه‌جایی صفحه خوانده می‌شود */
  async queueCount(): Promise<AdminUpgReviewCount> {
    const [payments, refunds] = await Promise.all([
      this.prisma.gatewayPayment.count({ where: QUEUED_PAYMENTS }),
      this.prisma.gatewayRefund.count({ where: queuedRefunds() }),
    ]);
    return { payments, refunds, total: payments + refunds };
  }

  async reviewPayment(
    id: string,
    dto: UpgReviewDto,
    admin: AdminJwtPayload,
  ): Promise<AdminGatewayPaymentDetail> {
    if (dto.outcome !== 'verified' && dto.outcome !== 'failed') {
      throw new BadRequestException('نتیجهٔ پرداخت «تأییدشده» یا «ناموفق» است');
    }
    const note = dto.note.trim();
    await this.upg.resolveUnknownPayment(id, dto.outcome, (tx, payment) =>
      this.audit(tx, admin, {
        action:
          dto.outcome === 'verified' ? 'PAYMENT_VERIFIED' : 'PAYMENT_FAILED',
        gatewayPaymentId: payment.id,
        fromStatus: payment.status,
        note,
      }),
    );
    return this.payment(id);
  }

  async reviewRefund(
    id: string,
    dto: UpgReviewDto,
    admin: AdminJwtPayload,
  ): Promise<AdminGatewayPaymentDetail> {
    if (dto.outcome !== 'succeeded' && dto.outcome !== 'failed') {
      throw new BadRequestException('نتیجهٔ بازگشت «موفق» یا «ناموفق» است');
    }
    const note = dto.note.trim();
    let paymentId = '';
    await this.cardRefunds.resolveManually(
      id,
      dto.outcome,
      note,
      (tx, refund) => {
        paymentId = refund.gatewayPaymentId;
        return this.audit(tx, admin, {
          action:
            dto.outcome === 'succeeded' ? 'REFUND_SUCCEEDED' : 'REFUND_FAILED',
          gatewayPaymentId: refund.gatewayPaymentId,
          gatewayRefundId: refund.id,
          fromStatus: refund.status,
          note,
        });
      },
    );
    return this.payment(paymentId);
  }

  async inquirePayment(id: string): Promise<AdminUpgInquiry> {
    const inquiry = await this.upg.inquirePayment(id);
    return {
      state: inquiry.state,
      error: inquiry.error ?? null,
      raw: inquiry.raw ?? inquiry.verified?.raw ?? null,
    };
  }

  async inquireRefund(id: string): Promise<AdminUpgInquiry> {
    const result = await this.cardRefunds.inquire(id);
    return {
      state: result.unknown ? 'unknown' : result.state,
      error: result.error ?? null,
      raw: result.raw ?? null,
    };
  }

  // ─── کیف پول بازگشت و تنظیمات ─────────────────────────────────────────────

  async refundWallets(): Promise<AdminRefundWallet[]> {
    const minimum =
      Number(process.env.UPG_REFUND_WALLET_MIN) > 0
        ? Number(process.env.UPG_REFUND_WALLET_MIN)
        : REFUND_WALLET_MIN;
    const since = new Date(Date.now() - DENIED_WINDOW_MS);

    const withWallet = this.gateways
      .all()
      .flatMap((gateway) =>
        gateway.refundWallet
          ? [{ gateway, read: gateway.refundWallet.bind(gateway) }]
          : [],
      );
    return Promise.all(
      withWallet.map(async ({ gateway, read }): Promise<AdminRefundWallet> => {
        const [open, denied, wallet] = await Promise.all([
          this.prisma.gatewayRefund.aggregate({
            where: {
              gateway: gateway.key,
              status: { in: ['SUBMITTING', 'PENDING', 'UNKNOWN'] },
            },
            _sum: { amount: true },
          }),
          this.prisma.gatewayRefund.count({
            where: {
              gateway: gateway.key,
              status: 'DENIED',
              createdAt: { gte: since },
            },
          }),
          read().then(
            (value) => ({ value, error: null }),
            (error: unknown) => ({
              value: null,
              error: error instanceof Error ? error.message : String(error),
            }),
          ),
        ]);
        // ریال → تومان، به سمت پایین تا مانده هرگز بیشتر از واقعی دیده نشود
        const balance = wallet.value
          ? Math.floor(wallet.value.balanceRial / 10)
          : null;
        return {
          gateway: gateway.key,
          gatewayLabel: gateway.label,
          mode: gateway.simulated ? 'mock' : 'live',
          enabled: this.gateways.isEnabled(gateway.key),
          balance,
          address: wallet.value?.address ?? null,
          minimum,
          openRefunds: Number(open._sum.amount ?? 0n),
          deniedRecently: denied,
          low: balance !== null && balance < minimum,
          error: wallet.error,
        };
      }),
    );
  }

  settings(): AdminUpgSettings {
    const config = this.gateways.config();
    const toman = this.gateways.toman;
    const http = toman.api instanceof TomanIpgHttpClient ? toman.api : null;
    return {
      configured: config.configured,
      rejected: config.rejected,
      strategy: config.strategy,
      available: this.gateways.available,
      production: process.env.NODE_ENV === 'production',
      allowMock: process.env.UPG_ALLOW_MOCK === 'true',
      publicUrl: this.upg.publicUrl,
      gateways: this.gateways.all().map((gateway) => ({
        key: gateway.key,
        label: gateway.label,
        enabled: config.enabled.includes(gateway.key),
        simulated: gateway.simulated,
        capabilities: { ...gateway.capabilities },
        weight: config.weights.get(gateway.key) ?? null,
        callbackUrl: `${this.upg.publicUrl}/api/upg/callback/${gateway.key}`,
      })),
      toman: {
        mode: toman.live ? 'live' : 'mock',
        ipgUrl: http?.baseUrl ?? null,
        authUrl: http?.authUrl ?? null,
        credentials: tomanCredentialsFromEnv('TOMAN_IPG_')
          ? 'TOMAN_IPG_*'
          : tomanCredentialsFromEnv('TOMAN_')
            ? 'TOMAN_*'
            : 'none',
        terminal: process.env.TOMAN_IPG_TERMINAL?.trim() || null,
      },
      mockRefundResult: process.env.UPG_MOCK_REFUND_RESULT?.trim() || null,
    };
  }

  // ─── کمکی‌ها ─────────────────────────────────────────────────────────────

  private audit(
    tx: Prisma.TransactionClient,
    admin: AdminJwtPayload,
    data: {
      action: GatewayReviewAction;
      gatewayPaymentId: string;
      gatewayRefundId?: string;
      fromStatus: string;
      note: string;
    },
  ) {
    return tx.gatewayReview.create({
      data: { ...data, adminId: admin.sub, adminUsername: admin.username },
    });
  }

  private paymentWhere(
    query: GatewayPaymentQueryDto,
  ): Prisma.GatewayPaymentWhereInput {
    const q = query.q?.trim();
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.gateway ? { gateway: query.gateway } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.companyId ? { employee: { companyId: query.companyId } } : {}),
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
              { trackerId: { contains: q } },
              { ref: { contains: q } },
              { traceNumber: { contains: q } },
              { referenceNumber: { contains: q } },
              {
                employee: {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { personnelCode: { contains: q } },
                    { nationalCode: { contains: q } },
                  ],
                },
              },
            ],
          }
        : {}),
    };
  }

  private paymentRow(row: PaymentRowSource): AdminGatewayPaymentRow {
    return {
      id: row.id,
      gateway: row.gateway,
      gatewayLabel: this.gateways.get(row.gateway)?.label ?? row.gateway,
      status: row.status,
      amount: Number(row.amount),
      refundedAmount: Number(row.refundedAmount),
      trackerId: row.trackerId,
      ref: row.ref,
      traceNumber: row.traceNumber,
      maskedCard: row.maskedCard,
      error: row.error,
      employee: employeeView(row.employee),
      intent: {
        id: row.intent.id,
        purpose: row.intent.purpose,
        title: row.intent.title,
      },
      createdAt: row.createdAt.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
    };
  }

  private refundRow(row: RefundRowSource): AdminGatewayRefundRow {
    return {
      id: row.id,
      gatewayPaymentId: row.gatewayPaymentId,
      gateway: row.gateway,
      amount: Number(row.amount),
      status: row.status,
      trackerId: row.trackerId,
      ref: row.ref,
      error: row.error,
      maskedCard: row.gatewayPayment.maskedCard,
      employee: employeeView(row.employee),
      createdAt: row.createdAt.toISOString(),
      checkedAt: row.checkedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}

function employeeView(employee: PaymentRowSource['employee']) {
  return {
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    personnelCode: employee.personnelCode,
    nationalCode: employee.nationalCode,
  };
}
