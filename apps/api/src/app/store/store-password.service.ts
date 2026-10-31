import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { StorePasswordOtpChallenge } from '@sanpay/models';
import * as bcrypt from 'bcrypt';
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { SmsService } from '../auth/sms.service';
import { PrismaService } from '../prisma/prisma.service';

const EXPIRY_SECONDS = 120;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const INVALID_CODE = 'کد تأیید نامعتبر یا منقضی شده است؛ دوباره کد بگیرید';
const SAME_PASSWORD = 'رمز جدید نباید با رمز فعلی یکی باشد';

/**
 * تغییر رمز پنل فروشگاه. بار اول (رمزی که مدیریت داده) با رمز فعلی؛ از آن به
 * بعد فقط با کد پیامکی به موبایل ثبت‌شدهٔ فروشگاه. هر تغییر، توکن‌های قبلی
 * را باطل می‌کند (`sessionsValidAfter`) و کنترلر توکن تازه برمی‌گرداند.
 */
@Injectable()
export class StorePasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async changeWithPassword(
    storeId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const store = await this.lockStore(tx, storeId);
      if (store.passwordChangedAt) {
        throw new BadRequestException(
          'رمز قبلاً تغییر کرده است؛ برای تغییر دوباره کد تأیید پیامکی بگیرید',
        );
      }
      if (!(await bcrypt.compare(currentPassword, store.passwordHash))) {
        throw new BadRequestException('رمز عبور فعلی نادرست است');
      }
      if (await bcrypt.compare(newPassword, store.passwordHash)) {
        throw new BadRequestException(SAME_PASSWORD);
      }
      await this.savePassword(tx, storeId, newPassword);
    });
  }

  async requestOtp(storeId: string): Promise<StorePasswordOtpChallenge> {
    const code = String(randomInt(100_000, 1_000_000));
    const id = randomUUID();
    const otp = await this.prisma.$transaction(async (tx) => {
      const store = await this.lockStore(tx, storeId);
      if (!store.passwordChangedAt) {
        throw new BadRequestException(
          'برای اولین تغییر رمز، رمز فعلی را وارد کنید',
        );
      }
      const phone = mobileOf(store.phone);
      const now = new Date();
      const latest = await tx.storePasswordOtp.findUnique({
        where: { storeId },
      });
      if (
        latest &&
        latest.sentAt.getTime() + RESEND_SECONDS * 1000 > now.getTime()
      ) {
        throw new BadRequestException(
          'برای ارسال دوبارهٔ کد، یک دقیقه صبر کنید',
        );
      }
      const data = {
        id,
        phone,
        codeHash: this.hashCode(id, storeId, phone, code),
        attempts: 0,
        sentAt: now,
        expiresAt: new Date(now.getTime() + EXPIRY_SECONDS * 1000),
      };
      return tx.storePasswordOtp.upsert({
        where: { storeId },
        create: { storeId, ...data },
        update: data,
      });
    });
    try {
      await this.sms.sendStorePasswordOtp(otp.phone, code);
    } catch (error) {
      // پیامک نرفت: کد را پاک کن تا فروشنده بدون انتظار یک‌دقیقه‌ای دوباره بگیرد
      await this.prisma.storePasswordOtp.deleteMany({ where: { id } });
      throw error;
    }
    return {
      phone: maskPhone(otp.phone),
      expiresInSeconds: EXPIRY_SECONDS,
      retryAfterSeconds: RESEND_SECONDS,
    };
  }

  async changeWithOtp(
    storeId: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const ok = await this.prisma.$transaction(async (tx) => {
      const store = await this.lockStore(tx, storeId);
      const otp = await tx.storePasswordOtp.findUnique({ where: { storeId } });
      if (
        !store.passwordChangedAt ||
        !otp ||
        otp.phone !== normalizeMobile(store.phone) ||
        otp.expiresAt <= new Date() ||
        otp.attempts >= MAX_ATTEMPTS
      ) {
        return false;
      }
      const hash = this.hashCode(otp.id, storeId, otp.phone, code);
      if (
        !timingSafeEqual(
          Buffer.from(hash, 'hex'),
          Buffer.from(otp.codeHash, 'hex'),
        )
      ) {
        await tx.storePasswordOtp.update({
          where: { id: otp.id },
          data: { attempts: { increment: 1 } },
        });
        // برگرداندن به‌جای throw تا افزایش شمارش تلاش commit شود
        return false;
      }
      // قبل از مصرف کد: با این خطا کد معتبر می‌ماند و فقط رمز دیگری لازم است
      if (await bcrypt.compare(newPassword, store.passwordHash)) {
        throw new BadRequestException(SAME_PASSWORD);
      }
      await tx.storePasswordOtp.delete({ where: { id: otp.id } });
      await this.savePassword(tx, storeId, newPassword);
      return true;
    });
    if (!ok) throw new BadRequestException(INVALID_CODE);
  }

  private async savePassword(
    tx: Prisma.TransactionClient,
    storeId: string,
    newPassword: string,
  ): Promise<void> {
    const now = new Date();
    await tx.store.update({
      where: { id: storeId },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: now,
        sessionsValidAfter: now,
      },
    });
  }

  private async lockStore(tx: Prisma.TransactionClient, storeId: string) {
    // درخواست‌های هم‌زمان از چند دستگاه را پشت سر هم می‌چیند
    await tx.$queryRaw`SELECT "id" FROM "Store" WHERE "id" = ${storeId} FOR UPDATE`;
    const store = await tx.store.findUnique({ where: { id: storeId } });
    if (!store || !store.isActive || store.deletedAt) {
      throw new UnauthorizedException();
    }
    return store;
  }

  private hashCode(
    id: string,
    storeId: string,
    phone: string,
    code: string,
  ): string {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('OTP_SECRET or JWT_SECRET must be configured');
    return createHmac('sha256', secret)
      .update(`store-password:${id}:${storeId}:${phone}:${code}`)
      .digest('hex');
  }
}

/**
 * `Store.phone` متن آزادِ داشبورد است و ممکن است تلفن ثابت باشد؛ فقط موبایل
 * ایران (۰۹…، ۹۸۹…، +۹۸۹…) با ارقام فارسی یا لاتین پذیرفته می‌شود.
 */
export function normalizeMobile(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '');
  const local = digits.replace(/^(?:0098|98)(?=9\d{9}$)/, '0');
  const mobile = /^9\d{9}$/.test(local) ? `0${local}` : local;
  return /^09\d{9}$/.test(mobile) ? mobile : null;
}

function mobileOf(raw: string | null): string {
  const phone = normalizeMobile(raw);
  if (!phone) {
    throw new BadRequestException(
      'شماره موبایل فروشگاه ثبت نشده است؛ از مدیریت سامانه بخواهید آن را ثبت کند',
    );
  }
  return phone;
}

/** `09123456789` → `0912***6789` */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}
