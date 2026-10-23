import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MerchantPaymentIntentResult,
  MerchantPaymentVerifyResult,
} from '@sanpay/models';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { SmsService } from '../auth/sms.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpgService } from '../upg/upg.service';
import {
  CreateMerchantPaymentIntentDto,
  VerifyMerchantPaymentIntentDto,
} from './dto/merchant-payment.dto';

const EXPIRY_SECONDS = 120;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

@Injectable()
export class MerchantPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly payments: PaymentsService,
    private readonly upg: UpgService,
  ) {}

  async request(
    storeId: string,
    dto: CreateMerchantPaymentIntentDto,
  ): Promise<MerchantPaymentIntentResult> {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.merchantPaymentIntent.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing && existing.storeId === storeId)
        return this.result(existing);
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        nationalCode: dto.nationalCode,
        phone: dto.phone,
        isActive: true,
        deletedAt: null,
        company: { isActive: true },
      },
    });
    if (!employee) {
      throw new BadRequestException('اطلاعات کارمند معتبر نیست');
    }
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, isActive: true },
    });
    if (!store) throw new BadRequestException('فروشگاه فعال نیست');

    // اعتبار ناکافی دیگر مانع نیست: باقی مبلغ بعد از OTP با لینک پرداخت
    // کارتی برای کارمند پیامک می‌شود (UPG)
    const checkout = await this.payments.checkout(employee.id, store.code);
    let remaining = dto.amount;
    const wallets = checkout.wallets.flatMap((wallet) => {
      if (remaining <= 0) return [];
      const used = Math.min(wallet.max, remaining);
      remaining -= used;
      return [wallet.name];
    });
    if (remaining > 0) wallets.push('کارت بانکی');

    const cooldown = await this.prisma.merchantPaymentIntent.findFirst({
      where: {
        storeId,
        employeeId: employee.id,
        status: 'PENDING',
        sentAt: { gt: new Date(Date.now() - RESEND_SECONDS * 1_000) },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (cooldown) return this.result(cooldown);

    const id = randomUUID();
    const code = String(randomInt(100_000, 1_000_000));
    await this.sms.sendPurchaseOtp(dto.phone, code, {
      store: store.name,
      price: dto.amount,
      wallets,
    });
    const intent = await this.prisma.merchantPaymentIntent.create({
      data: {
        id,
        storeId,
        employeeId: employee.id,
        amount: BigInt(dto.amount),
        codeHash: this.hash(id, code),
        expiresAt: new Date(Date.now() + EXPIRY_SECONDS * 1_000),
        idempotencyKey: dto.idempotencyKey || null,
      },
    });
    return this.result(intent);
  }

  /**
   * تأیید OTP و پرداخت از طریق UPG. اگر اعتبار کفاف داد، رسید همین‌جا
   * برمی‌گردد. وگرنه سهم اعتبار کسر **نمی‌شود** تا کارمند باقی را با کارت
   * بدهد؛ لینک پرداخت پیامک می‌شود و رسید بعد از پرداخت او از جریان زندهٔ
   * پنل (SSE) می‌رسد. کارمند در صفحهٔ UPG می‌تواند تقسیم را هم تغییر دهد.
   */
  async verify(
    storeId: string,
    dto: VerifyMerchantPaymentIntentDto,
  ): Promise<MerchantPaymentVerifyResult> {
    const intent = await this.prisma.merchantPaymentIntent.findFirst({
      where: { id: dto.intentId, storeId },
      include: { store: true, payment: true, upgIntent: true },
    });
    if (intent?.payment) {
      return {
        status: 'COMPLETED',
        receipt: await this.payments.receipt(intent.payment.id),
      };
    }
    if (intent?.upgIntent && intent.status === 'USED') {
      return this.awaiting(intent.upgIntent.id);
    }
    if (
      !intent ||
      intent.status !== 'PENDING' ||
      intent.expiresAt <= new Date() ||
      intent.attempts >= MAX_ATTEMPTS
    ) {
      throw new UnauthorizedException('کد نامعتبر یا منقضی شده است');
    }
    if (intent.codeHash !== this.hash(intent.id, dto.code)) {
      await this.prisma.merchantPaymentIntent.update({
        where: { id: intent.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('کد نامعتبر یا منقضی شده است');
    }

    // OTP یک‌بار مصرف است، حتی اگر پرداخت در ادامه به کارت نیاز داشته باشد
    const claimed = await this.prisma.merchantPaymentIntent.updateMany({
      where: { id: intent.id, status: 'PENDING' },
      data: { status: 'USED' },
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException('کد نامعتبر یا منقضی شده است');
    }

    const upgIntent = await this.payments.startPayment(
      intent.employeeId,
      { storeCode: intent.store.code, amount: Number(intent.amount) },
      intent.id,
    );
    const settled = await this.upg.settleWithCredit(upgIntent.id);

    if (settled.intent.status === 'COMPLETED') {
      const payment = await this.prisma.payment.findUniqueOrThrow({
        where: { intentId: upgIntent.id },
      });
      return {
        status: 'COMPLETED',
        receipt: await this.payments.receipt(payment.id),
      };
    }
    if (settled.cardAmount === 0) {
      // اعتبار کافی بود ولی کسر یا ثبت شکست خورد
      throw new BadRequestException(
        settled.intent.failureReason ?? 'ثبت پرداخت ممکن نشد',
      );
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: intent.employeeId },
      select: { phone: true },
    });
    if (employee.phone) {
      this.sms.sendPaymentLink(employee.phone, {
        store: intent.store.name,
        amount: settled.cardAmount,
        link: `${this.upg.publicUrl}/upg/${upgIntent.id}`,
      });
    }
    return {
      status: 'AWAITING_EMPLOYEE',
      upgIntentId: upgIntent.id,
      creditAmount: settled.creditAmount,
      cardAmount: settled.cardAmount,
    };
  }

  private async awaiting(
    upgIntentId: string,
  ): Promise<MerchantPaymentVerifyResult> {
    const intent = await this.prisma.paymentIntent.findUniqueOrThrow({
      where: { id: upgIntentId },
    });
    return {
      status: 'AWAITING_EMPLOYEE',
      upgIntentId,
      creditAmount: Number(intent.amount - intent.gatewayAmount),
      cardAmount: Number(intent.gatewayAmount),
    };
  }

  private result(intent: { id: string; expiresAt: Date; sentAt: Date }) {
    return {
      intentId: intent.id,
      expiresInSeconds: Math.max(
        0,
        Math.ceil((intent.expiresAt.getTime() - Date.now()) / 1_000),
      ),
      retryAfterSeconds: Math.max(
        0,
        Math.ceil(
          (intent.sentAt.getTime() + RESEND_SECONDS * 1_000 - Date.now()) /
            1_000,
        ),
      ),
    };
  }

  private hash(intentId: string, code: string): string {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('OTP_SECRET or JWT_SECRET must be configured');
    return createHmac('sha256', secret)
      .update(`${intentId}:${code}`)
      .digest('hex');
  }
}
