import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MerchantPaymentIntentResult, Receipt } from '@sanpay/models';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { SmsService } from '../auth/sms.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  async request(
    storeId: string,
    dto: CreateMerchantPaymentIntentDto,
  ): Promise<MerchantPaymentIntentResult> {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.merchantPaymentIntent.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing && existing.storeId === storeId) return this.result(existing);
    }

    const employee = await this.prisma.employee.findFirst({
      where: {
        nationalCode: dto.nationalCode,
        phone: dto.phone,
        isActive: true,
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

    const checkout = await this.payments.checkout(employee.id, store.code);
    if (checkout.totalAvailable < dto.amount) {
      throw new BadRequestException('اعتبار قابل استفاده برای این مبلغ کافی نیست');
    }

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
    await this.sms.sendOtp(dto.phone, code);
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

  async verify(
    storeId: string,
    dto: VerifyMerchantPaymentIntentDto,
  ): Promise<Receipt> {
    const intent = await this.prisma.merchantPaymentIntent.findFirst({
      where: { id: dto.intentId, storeId },
      include: { store: true, payment: true },
    });
    if (intent?.payment) return this.payments.receipt(intent.payment.id);
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

    const checkout = await this.payments.checkout(intent.employeeId, intent.store.code);
    let remaining = Number(intent.amount);
    const lines = checkout.wallets.flatMap((wallet) => {
      if (remaining <= 0) return [];
      const amount = Math.min(wallet.max, remaining);
      remaining -= amount;
      return [{ allocationId: wallet.allocationId, amount }];
    });
    if (remaining > 0) {
      throw new BadRequestException('اعتبار کارمند از زمان ارسال کد تغییر کرده است');
    }

    const receipt = await this.payments.create(
      intent.employeeId,
      { storeCode: intent.store.code, lines },
      intent.id,
    );
    await this.prisma.merchantPaymentIntent.update({
      where: { id: intent.id },
      data: { status: 'USED' },
    });
    return receipt;
  }

  private result(intent: { id: string; expiresAt: Date; sentAt: Date }) {
    return {
      intentId: intent.id,
      expiresInSeconds: Math.max(0, Math.ceil((intent.expiresAt.getTime() - Date.now()) / 1_000)),
      retryAfterSeconds: Math.max(0, Math.ceil((intent.sentAt.getTime() + RESEND_SECONDS * 1_000 - Date.now()) / 1_000)),
    };
  }

  private hash(intentId: string, code: string): string {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('OTP_SECRET or JWT_SECRET must be configured');
    return createHmac('sha256', secret).update(`${intentId}:${code}`).digest('hex');
  }
}
