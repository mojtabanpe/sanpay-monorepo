import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HotelBooking } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GdsReserveReport,
  GdsWebhookEventPayload,
} from './gds/gds.types';

/** نتیجه‌ای که به هتل‌یار برمی‌گردانیم — فقط برای لاگ خودشان */
export interface WebhookResult {
  received: true;
  status: 'processed' | 'duplicate' | 'unmatched';
}

/**
 * پردازش رویدادهای webhook هتل‌یار (بخش ۱۴ داکیومنت v6.3).
 *
 * سه نکته که شکل این کلاس را تعیین کرده‌اند:
 *
 * ۱. **idempotency**: هتل‌یار در صورت نگرفتن ۲۰۰ همان رویداد را دوباره
 *    می‌فرستد. هر رویداد با کلید یکتای (action, reservationId, changeId) ثبت
 *    می‌شود و فقط رویدادی که قبلاً **با موفقیت** پردازش شده دوباره اجرا
 *    نمی‌شود؛ رویدادِ ناموفق عمداً دوباره پردازش می‌شود.
 * ۲. **برگشت اعتبار**: رد یا کنسل‌شدن رزرو باید اعتبار کارمند را برگرداند،
 *    وگرنه پولی سوخته که هیچ اقامتی پشتش نیست. برگشت فقط یک‌بار انجام
 *    می‌شود (`refundedAmount` نگهبان آن است).
 * ۳. **رویداد بی‌صاحب**: اگر رزرو متناظر پیدا نشد، رویداد را دور نمی‌ریزیم —
 *    خام ذخیره می‌شود تا دستی بررسی شود، و ۲۰۰ می‌گیرد تا هتل‌یار تا ابد
 *    دوباره نفرستد.
 */
@Injectable()
export class TourismWebhookService {
  private readonly logger = new Logger(TourismWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handle(payload: GdsWebhookEventPayload): Promise<WebhookResult> {
    const action = payload?.action;
    const reservationId = String(payload?.detail?.reservationId ?? '');
    if (!action || !reservationId) {
      throw new BadRequestException('action یا reservationId ندارد');
    }
    const changeId = String(payload.detail.changeId ?? '');

    const existing = await this.prisma.gdsWebhookEvent.findUnique({
      where: {
        action_reservationId_changeId: { action, reservationId, changeId },
      },
    });
    if (existing?.processedAt) {
      return { received: true, status: 'duplicate' };
    }

    const booking = await this.findBooking(
      reservationId,
      payload.detail.report,
    );

    const event =
      existing ??
      (await this.prisma.gdsWebhookEvent.create({
        data: {
          action,
          reservationId,
          changeId,
          payload: payload as object,
          bookingId: booking?.id ?? null,
        },
      }));

    if (!booking) {
      this.logger.warn(
        `رویداد ${action} برای رزرو ${reservationId} رزرو متناظری ندارد — فقط ذخیره شد`,
      );
      await this.prisma.gdsWebhookEvent.update({
        where: { id: event.id },
        data: { error: 'رزرو متناظر پیدا نشد' },
      });
      return { received: true, status: 'unmatched' };
    }

    try {
      await this.apply(action, payload, booking);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `پردازش رویداد ${action} رزرو ${reservationId} شکست خورد: ${message}`,
      );
      await this.prisma.gdsWebhookEvent.update({
        where: { id: event.id },
        data: { error: message, bookingId: booking.id },
      });
      // پرتاب دوباره تا هتل‌یار ۲۰۰ نگیرد و رویداد را دوباره بفرستد
      throw error;
    }

    await this.prisma.gdsWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: null, bookingId: booking.id },
    });
    return { received: true, status: 'processed' };
  }

  private async apply(
    action: string,
    payload: GdsWebhookEventPayload,
    booking: HotelBooking,
  ): Promise<void> {
    const report = payload.detail.report;

    switch (action) {
      case 'reserve': {
        // رزرو آفلاین تأیید شد. اگر قبلاً کنسل/رد شده، تأیید دیرهنگام را
        // نمی‌پذیریم — وضعیت نهایی و برگشت اعتبار نباید عقب‌گرد کند.
        if (booking.status === 'REJECTED' || booking.status === 'CANCELED') {
          this.logger.warn(
            `تأیید دیرهنگام برای رزرو ${booking.referenceNo} نادیده گرفته شد (وضعیت ${booking.status})`,
          );
          return;
        }
        await this.prisma.hotelBooking.update({
          where: { id: booking.id },
          data: {
            status: 'CONFIRMED',
            payable: hotelPrice(report) ?? booking.payable,
            statusNote: null,
          },
        });
        return;
      }

      case 'reserve_reject': {
        await this.settleAsFailed(
          booking,
          'REJECTED',
          booking.amount,
          payload.detail.message ?? 'هتل ظرفیت کافی نداشت',
        );
        return;
      }

      case 'change': {
        if (!isCancellation(report)) {
          // تغییری غیر از کنسلی (مثلاً جابه‌جایی اتاق) — فقط بدهی به هتل‌یار
          // به‌روز می‌شود؛ مبلغ کارمند بدون تصمیم انسانی دست نمی‌خورد.
          await this.prisma.hotelBooking.update({
            where: { id: booking.id },
            data: {
              payable: hotelPrice(report) ?? booking.payable,
              statusNote: 'رزرو از سمت هتل‌یار تغییر کرد',
            },
          });
          return;
        }
        // جریمهٔ کنسلی سهم هتل است؛ فقط totalReturnToCustomer به کیف پول برمی‌گردد
        const refund = returnToCustomer(report) ?? booking.amount;
        await this.settleAsFailed(
          booking,
          'CANCELED',
          refund,
          'رزرو کنسل شد',
        );
        return;
      }

      default:
        this.logger.warn(`اکشن ناشناختهٔ webhook: ${action}`);
    }
  }

  /**
   * رزرو به وضعیت پایانیِ ناموفق می‌رود و اعتبار (یا بخش قابل‌برگشتش) به کیف
   * پول برمی‌گردد. `refundedAmount` نگهبان یکتایی است: اگر پر باشد یعنی
   * برگشت قبلاً انجام شده و رویداد تکراری نباید دوباره اعتبار بریزد.
   */
  private async settleAsFailed(
    booking: HotelBooking,
    status: 'REJECTED' | 'CANCELED',
    refundRaw: bigint | number,
    note: string,
  ): Promise<void> {
    const alreadyRefunded = booking.refundedAmount !== null;
    // اگر رزرو هرگز به کسر اعتبار نرسیده (transactionId=null) چیزی برای برگشت نیست
    const refundable = booking.transactionId !== null && !alreadyRefunded;
    const refund = clamp(BigInt(Math.trunc(Number(refundRaw))), booking.amount);

    await this.prisma.$transaction(async (tx) => {
      if (refundable && refund > 0n) {
        const allocation = await tx.walletAllocation.findUniqueOrThrow({
          where: { id: booking.allocationId },
        });
        // spent هرگز نباید منفی شود؛ اگر شد یعنی جای دیگری حساب خراب است
        const back = refund > allocation.spent ? allocation.spent : refund;
        await tx.walletAllocation.update({
          where: { id: allocation.id },
          data: { spent: allocation.spent - back },
        });
        await tx.transaction.create({
          data: {
            type: 'REFUND',
            amount: back,
            employeeId: booking.employeeId,
            allocationId: allocation.id,
            note: `${note} — رزرو هتل ${booking.hotelName}، پیگیری ${booking.referenceNo}`,
          },
        });
      }

      await tx.hotelBooking.update({
        where: { id: booking.id },
        data: {
          status,
          canceledAt: new Date(),
          statusNote: note,
          // بدهی به هتل‌یار بابت رزرو ناموفق، جریمهٔ کنسلی است نه کل مبلغ
          payable: booking.amount - refund,
          refundedAmount: refundable ? refund : (booking.refundedAmount ?? 0n),
        },
      });
    });
  }

  /**
   * تطبیق رویداد با رزرو ما: اول شناسهٔ هتل‌یار، بعد `externalId` که همان
   * شمارهٔ پیگیری خودمان است — رزروی که ثبتش نیمه‌کاره مانده gdsReserveId ندارد.
   */
  private async findBooking(
    reservationId: string,
    report: GdsReserveReport | undefined,
  ): Promise<HotelBooking | null> {
    const byReserveId = await this.prisma.hotelBooking.findFirst({
      where: { gdsReserveId: reservationId },
      orderBy: { createdAt: 'desc' },
    });
    if (byReserveId) {
      return byReserveId;
    }
    const referenceNo = report?.externalId;
    if (!referenceNo) {
      return null;
    }
    return this.prisma.hotelBooking.findUnique({ where: { referenceNo } });
  }
}

/** آخرین سطر changesLog کنسلی است؟ (operation = 1) */
function isCancellation(report: GdsReserveReport | undefined): boolean {
  const changes = lastChange(report)?.detail?.changes ?? [];
  return changes.some((change) => Number(change.operation) === 1);
}

function returnToCustomer(report: GdsReserveReport | undefined): number | null {
  const value = lastChange(report)?.detail?.price?.totalReturnToCustomer;
  return typeof value === 'number' ? value : null;
}

function lastChange(report: GdsReserveReport | undefined) {
  const log = report?.changesLog ?? [];
  return log.length > 0 ? log[log.length - 1] : undefined;
}

function hotelPrice(report: GdsReserveReport | undefined): bigint | null {
  const value = report?.currentReserve?.detail?.price?.totalHotelPrice;
  return typeof value === 'number' ? BigInt(Math.trunc(value)) : null;
}

function clamp(value: bigint, max: bigint): bigint {
  if (value < 0n) {
    return 0n;
  }
  return value > max ? max : value;
}
