import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PhoneChangeChallenge } from '@sanpay/models';
import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';

const EXPIRY_SECONDS = 120;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const DUPLICATE_PHONE = 'این شماره موبایل قبلاً در سامانه ثبت شده است';
const INVALID_CODE = 'کد تأیید نامعتبر یا منقضی شده است؛ دوباره کد بگیرید';

@Injectable()
export class PhoneChangeService {
  private readonly logger = new Logger(PhoneChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async request(
    employeeId: string,
    newPhone: string,
  ): Promise<PhoneChangeChallenge> {
    const code = String(randomInt(100_000, 1_000_000));
    const id = randomUUID();
    const change = await this.prisma.$transaction(async (tx) => {
      const employee = await this.lockEmployee(tx, employeeId);
      if (!employee.phone) {
        throw new BadRequestException(
          'شمارهٔ قبلی ثبت نشده است؛ با پشتیبانی تماس بگیرید',
        );
      }
      if (employee.phone === newPhone)
        throw new BadRequestException('شمارهٔ جدید با شمارهٔ فعلی یکسان است');
      // Includes inactive/archived employments, matching Employee.phone's global unique constraint.
      await this.assertAvailable(tx, newPhone);
      const latest = await tx.employeePhoneChange.findFirst({
        where: { employeeId },
        orderBy: { sentAt: 'desc' },
      });
      const now = new Date();
      if (
        latest &&
        latest.sentAt.getTime() + RESEND_SECONDS * 1000 > now.getTime()
      ) {
        throw new BadRequestException(
          'برای ارسال دوبارهٔ کد، یک دقیقه صبر کنید',
        );
      }
      await tx.employeePhoneChange.updateMany({
        where: { employeeId, confirmedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });
      return tx.employeePhoneChange.create({
        data: {
          id,
          employeeId,
          oldPhone: employee.phone,
          newPhone,
          codeHash: this.hashCode(
            id,
            employeeId,
            employee.phone,
            newPhone,
            code,
          ),
          sentAt: now,
          expiresAt: new Date(now.getTime() + EXPIRY_SECONDS * 1000),
        },
      });
    });
    try {
      await this.sms.sendPhoneChangeOtp(change.oldPhone, code, newPhone);
    } catch (error) {
      await this.prisma.employeePhoneChange.updateMany({
        where: { id, confirmedAt: null },
        data: { invalidatedAt: new Date() },
      });
      throw error;
    }
    return {
      requestId: id,
      expiresInSeconds: Math.max(
        0,
        Math.floor((change.expiresAt.getTime() - Date.now()) / 1000),
      ),
      retryAfterSeconds: Math.max(
        0,
        Math.ceil(
          (change.sentAt.getTime() + RESEND_SECONDS * 1000 - Date.now()) / 1000,
        ),
      ),
    };
  }

  async confirm(
    employeeId: string,
    input: { phone: string; requestId: string; code: string },
  ): Promise<void> {
    let result: { invalid: boolean; id?: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const employee = await this.lockEmployee(tx, employeeId);
        const change = await tx.employeePhoneChange.findUnique({
          where: { id: input.requestId },
        });
        const now = new Date();
        if (
          !change ||
          change.employeeId !== employeeId ||
          change.oldPhone !== employee.phone ||
          change.newPhone !== input.phone ||
          change.confirmedAt ||
          change.invalidatedAt ||
          change.expiresAt <= now ||
          change.attempts >= MAX_ATTEMPTS
        ) {
          return { invalid: true };
        }
        // Recheck after the OTP wait; the unique constraint also handles simultaneous claims.
        await this.assertAvailable(tx, input.phone);
        const hash = this.hashCode(
          change.id,
          employeeId,
          change.oldPhone,
          change.newPhone,
          input.code,
        );
        if (
          !timingSafeEqual(
            Buffer.from(hash, 'hex'),
            Buffer.from(change.codeHash, 'hex'),
          )
        ) {
          await tx.employeePhoneChange.update({
            where: { id: change.id },
            data: { attempts: { increment: 1 } },
          });
          // Return instead of throwing here so the failed-attempt increment commits.
          return { invalid: true };
        }
        await tx.employee.update({
          where: { id: employeeId },
          data: { phone: input.phone },
        });
        await tx.employeeOtp.deleteMany({ where: { employeeId } });
        await tx.employeePhoneChange.update({
          where: { id: change.id },
          data: { confirmedAt: now, nextNoticeAttemptAt: now },
        });
        return { invalid: false, id: change.id };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(DUPLICATE_PHONE);
      }
      throw error;
    }
    if (result.invalid) throw new BadRequestException(INVALID_CODE);
    // The committed change itself is the durable outbox entry. SMS failure never rolls back a phone.
    void this.deliverNotice(result.id!).catch(() =>
      this.logger.warn('ارسال اعلان تغییر شماره به تلاش بعدی موکول شد'),
    );
  }

  private async lockEmployee(tx: Prisma.TransactionClient, employeeId: string) {
    // Serializes requests and confirmations across devices and API instances.
    await tx.$queryRaw`SELECT "id" FROM "Employee" WHERE "id" = ${employeeId} FOR UPDATE`;
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      include: { company: true },
    });
    if (
      !employee ||
      employee.deletedAt ||
      !employee.isActive ||
      !employee.company.isActive
    ) {
      throw new UnauthorizedException();
    }
    return employee;
  }

  private async assertAvailable(
    tx: Prisma.TransactionClient,
    phone: string,
  ): Promise<void> {
    if (
      await tx.employee.findUnique({ where: { phone }, select: { id: true } })
    ) {
      throw new BadRequestException(DUPLICATE_PHONE);
    }
  }

  private hashCode(
    id: string,
    employeeId: string,
    oldPhone: string,
    newPhone: string,
    code: string,
  ): string {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('OTP_SECRET or JWT_SECRET must be configured');
    return createHmac('sha256', secret)
      .update(
        `phone-change:${id}:${employeeId}:${oldPhone}:${newPhone}:${code}`,
      )
      .digest('hex');
  }

  @Interval(60_000)
  async retryNotices(): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.employeePhoneChange.findMany({
      where: {
        confirmedAt: { not: null },
        nextNoticeAttemptAt: { lte: now },
        AND: [
          { OR: [{ oldNoticeSentAt: null }, { newNoticeSentAt: null }] },
          {
            OR: [
              { noticeLockedUntil: null },
              { noticeLockedUntil: { lte: now } },
            ],
          },
        ],
      },
      orderBy: { nextNoticeAttemptAt: 'asc' },
      take: 20,
      select: { id: true },
    });
    for (const change of pending) await this.deliverNotice(change.id);
  }

  async deliverNotice(id: string): Promise<void> {
    const now = new Date();
    const claimed = await this.prisma.employeePhoneChange.updateMany({
      where: {
        id,
        confirmedAt: { not: null },
        nextNoticeAttemptAt: { lte: now },
        AND: [
          { OR: [{ oldNoticeSentAt: null }, { newNoticeSentAt: null }] },
          {
            OR: [
              { noticeLockedUntil: null },
              { noticeLockedUntil: { lte: now } },
            ],
          },
        ],
      },
      data: {
        noticeLockedUntil: new Date(now.getTime() + 120_000),
        noticeAttempts: { increment: 1 },
      },
    });
    if (!claimed.count) return;
    const change = await this.prisma.employeePhoneChange.findUniqueOrThrow({
      where: { id },
    });
    try {
      if (!change.oldNoticeSentAt) {
        await this.sms.sendPhoneChangeNotice(
          change.oldPhone,
          change.oldPhone,
          change.newPhone,
          change.confirmedAt!,
        );
        await this.prisma.employeePhoneChange.update({
          where: { id },
          data: { oldNoticeSentAt: new Date() },
        });
      }
      if (!change.newNoticeSentAt) {
        await this.sms.sendPhoneChangeNotice(
          change.newPhone,
          change.oldPhone,
          change.newPhone,
          change.confirmedAt!,
        );
        await this.prisma.employeePhoneChange.update({
          where: { id },
          data: { newNoticeSentAt: new Date() },
        });
      }
    } catch {
      this.logger.warn(
        'پیامک اطلاع‌رسانی تغییر شماره ارسال نشد؛ دوباره تلاش می‌شود',
      );
    } finally {
      await this.prisma.employeePhoneChange.update({
        where: { id },
        data: {
          noticeLockedUntil: null,
          nextNoticeAttemptAt: new Date(
            Date.now() +
              Math.min(
                3_600_000,
                60_000 * 2 ** Math.min(change.noticeAttempts - 1, 6),
              ),
          ),
        },
      });
    }
  }
}
