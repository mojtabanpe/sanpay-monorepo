import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  FlightBookingInput,
  FlightBookingReceipt,
  FlightBookingStatus,
  FlightLeg,
  FlightOffer,
  FlightQuote,
  FlightSearchInput,
  FlightTicket,
  UpgIntentCreated,
} from '@sanpay/models';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentIntent, Prisma } from '../../../generated/prisma/client';
import { UpgService } from '../../upg/upg.service';
import {
  FlightProvider,
  FlightProviderRejectedException,
  ProviderReservation,
} from './flight-provider';
import { QuoteFlightDto } from './flights.dto';

export function validateFlightSearch(input: FlightSearchInput): void {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  if (
    input.origin === input.destination ||
    input.departureDate < today ||
    (input.returnDate && input.returnDate < input.departureDate) ||
    input.adults + input.children > 9 ||
    input.infants > input.adults
  ) {
    throw new BadRequestException(
      'مسیر، تاریخ یا تعداد مسافران معتبر نیست؛ هر نوزاد باید همراه یک بزرگسال باشد',
    );
  }
}
export function validateFlightPassengers(
  input: FlightBookingInput,
  search: FlightSearchInput,
  offer: FlightOffer,
): void {
  for (const [type, count] of [
    ['adult', search.adults],
    ['child', search.children],
    ['infant', search.infants],
  ] as const) {
    if (input.passengers.filter((p) => p.type === type).length !== count)
      throw new BadRequestException('تعداد مسافران با جست‌وجو مطابقت ندارد');
  }
  const identities = new Set<string>();
  for (const p of input.passengers) {
    const ageAt = (date: string) => {
      const [y, m, d] = date.split('-').map(Number);
      const [by, bm, bd] = p.birthdate.split('-').map(Number);
      return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
    };
    for (const date of [
      search.departureDate,
      ...(search.returnDate ? [search.returnDate] : []),
    ]) {
      const age = ageAt(date);
      if (
        age < 0 ||
        age > 120 ||
        (p.type === 'adult'
          ? age < 12
          : p.type === 'child'
            ? age < 2 || age >= 12
            : age >= 2)
      )
        throw new BadRequestException(
          'تاریخ تولد با گروه سنی مسافر در تاریخ پرواز مطابقت ندارد',
        );
    }
    const needsPassport =
      offer.departure.foreign ||
      offer.returning?.foreign ||
      p.nationality !== 'IR';
    if (
      needsPassport &&
      (!p.passportNumber ||
        !p.passportIssueCountry ||
        !p.passportExpirationDate ||
        p.passportExpirationDate <= (search.returnDate || search.departureDate))
    )
      throw new BadRequestException(
        'اطلاعات گذرنامه معتبر برای این مسافر الزامی است',
      );
    if (
      !needsPassport &&
      (!p.nationalCode || !isValidIranianNationalCode(p.nationalCode))
    )
      throw new BadRequestException('کد ملی مسافر معتبر نیست');
    const identity = needsPassport
      ? `${p.passportIssueCountry}:${p.passportNumber}`
      : (p.nationalCode ?? '');
    if (identities.has(identity))
      throw new BadRequestException('مشخصات مسافران تکراری است');
    identities.add(identity);
  }
}
@Injectable()
export class FlightsService {
  private readonly logger = new Logger(FlightsService.name);
  private polling = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FlightProvider,
    private readonly upg: UpgService,
  ) {}
  airports() {
    return this.provider.airports();
  }
  search(input: FlightSearchInput) {
    validateFlightSearch(input);
    return this.provider.search(input);
  }
  async quote(employeeId: string, input: QuoteFlightDto): Promise<FlightQuote> {
    const { offerId, ...search } = input;
    const found = (await this.search(search)).find((f) => f.id === offerId);
    if (!found)
      throw new ConflictException(
        'این پرواز دیگر موجود نیست؛ دوباره جست‌وجو کنید',
      );
    const offer = await this.withCancellationRules(found);
    const quote = await this.prisma.flightQuote.create({
      data: {
        employeeId,
        search: search as unknown as Prisma.InputJsonValue,
        offer: offer as unknown as Prisma.InputJsonValue,
        amount: BigInt(offer.amount),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    const allocations = await this.prisma.walletAllocation.findMany({
      where: {
        employeeId,
        isActive: true,
        expiresAt: { gt: new Date() },
        definition: { isActive: true, kind: 'TOURISM' },
      },
      include: { definition: true },
      orderBy: { expiresAt: 'asc' },
    });
    return {
      id: quote.id,
      offer,
      search,
      expiresAt: quote.expiresAt.toISOString(),
      wallets: allocations
        .map((a) => ({
          allocationId: a.id,
          name: a.definition.name,
          icon: a.definition.icon,
          max: Number(a.cap - a.spent),
          expiresAt: a.expiresAt.toISOString(),
        }))
        .filter((w) => w.max > 0),
    };
  }
  /** قوانین کنسلی فقط بعد از انتخاب پرواز گرفته می‌شود، نه برای هر نتیجهٔ جست‌وجو */
  private async withCancellationRules(offer: FlightOffer): Promise<FlightOffer> {
    const fill = async (leg: FlightLeg): Promise<FlightLeg> =>
      leg.cancellationRules.length || !leg.rateClass
        ? leg
        : {
            ...leg,
            cancellationRules: await this.provider.cancellationRules(
              leg.airline,
              leg.rateClass,
            ),
          };
    const [departure, returning] = await Promise.all([
      fill(offer.departure),
      offer.returning ? fill(offer.returning) : null,
    ]);
    return { ...offer, departure, returning };
  }
  /**
   * شروع رزرو پرواز: رکورد `AWAITING_PAYMENT` و درخواست پرداخت UPG. پس از
   * کسر کامل پول، UPG `fulfillBooking` را صدا می‌زند. quoteId یکتاست، پس
   * ارسال دوباره همان intent را برمی‌گرداند.
   */
  async book(
    employeeId: string,
    input: FlightBookingInput,
  ): Promise<UpgIntentCreated> {
    const existing = await this.prisma.flightBooking.findUnique({
      where: { quoteId: input.quoteId },
    });
    if (existing?.intentId && existing.employeeId === employeeId)
      return { intentId: existing.intentId };
    if (existing) throw new ConflictException('این پیش‌فاکتور قبلاً استفاده شده است');
    this.provider.assertConfigured();
    const quote = await this.prisma.flightQuote.findFirst({
      where: { id: input.quoteId, employeeId },
    });
    if (!quote) throw new NotFoundException('پیش‌فاکتور پیدا نشد');
    if (quote.expiresAt <= new Date())
      throw new ConflictException(
        'مهلت پیش‌فاکتور تمام شده؛ دوباره پرواز را انتخاب کنید',
      );
    const search = quote.search as unknown as FlightSearchInput;
    const offer = quote.offer as unknown as FlightOffer;
    validateFlightPassengers(input, search, offer);

    const allowed = await this.prisma.walletAllocation.findMany({
      where: { employeeId, definition: { kind: 'TOURISM' } },
      select: { id: true },
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const booking = await tx.flightBooking.create({
          data: {
            quoteId: quote.id,
            employeeId,
            status: 'AWAITING_PAYMENT',
            amount: quote.amount,
            passengers: input.passengers as unknown as Prisma.InputJsonValue,
            bookerMobile: input.mobile,
            bookerFirstName: input.bookerFirstName,
            bookerLastName: input.bookerLastName,
          },
        });
        const intent = await this.upg.createIntent(
          {
            employeeId,
            purpose: 'FLIGHT',
            targetId: booking.id,
            title: `پرواز ${offer.departure.origin} به ${offer.departure.destination}`,
            subtitle: offer.returning ? 'رفت و برگشت' : 'یک‌طرفه',
            amount: Number(quote.amount),
            allowedAllocationIds: allowed.map((allocation) => allocation.id),
          },
          tx,
        );
        await tx.flightBooking.update({
          where: { id: booking.id },
          data: { intentId: intent.id },
        });
        return { intentId: intent.id };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.prisma.flightBooking.findUnique({
          where: { quoteId: quote.id },
        });
        if (duplicate?.intentId && duplicate.employeeId === employeeId)
          return { intentId: duplicate.intentId };
      }
      throw error;
    }
  }

  /**
   * صدور بلیت بعد از کسر پول. ردِ صریح تأمین‌کننده = خطا (UPG همه‌چیز را
   * برمی‌گرداند). timeout اثبات شکست نیست: پول و رکورد برای استعلام می‌مانند
   * و اگر بعداً رد شد، `refund` از طریق UPG برمی‌گرداند.
   */
  async fulfillBooking(intent: PaymentIntent): Promise<void> {
    const booking = await this.prisma.flightBooking.findUniqueOrThrow({
      where: { intentId: intent.id },
      include: { quote: true },
    });
    const claimed = await this.prisma.flightBooking.updateMany({
      where: { id: booking.id, status: 'AWAITING_PAYMENT' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count !== 1) return;

    const offer = booking.quote.offer as unknown as FlightOffer;
    const input: FlightBookingInput = {
      quoteId: booking.quoteId,
      bookerFirstName: booking.bookerFirstName ?? '',
      bookerLastName: booking.bookerLastName ?? '',
      mobile: booking.bookerMobile ?? '',
      passengers: booking.passengers as unknown as FlightBookingInput['passengers'],
    };
    try {
      const locked = await this.provider.create(offer, input);
      await this.prisma.flightBooking.update({
        where: { id: booking.id },
        data: { confirmationCode: locked.confirmationCode },
      });
      if (locked.status === 'approved') {
        await this.issueApproved(booking.id, offer.amount, locked);
      } else {
        await this.applyStatus(booking.id, locked);
      }
    } catch (error) {
      if (error instanceof FlightProviderRejectedException) {
        await this.prisma.flightBooking.updateMany({
          where: { id: booking.id, refunded: false },
          data: { status: 'REJECTED', refunded: true },
        });
        throw new BadRequestException(
          'درخواست رزرو پرواز از سوی تأمین‌کننده پذیرفته نشد؛ مبلغ برگشت داده شد',
        );
      }
      // A timeout is NOT proof of failure. Preserve funds and the durable record for inquiry.
      await this.prisma.flightBooking.updateMany({
        where: { id: booking.id, status: 'PROCESSING' },
        data: { status: 'REVIEW' },
      });
      this.logger.warn(`Flight reservation requires inquiry: ${booking.id}`);
    }
  }

  /** پرداخت انجام نشد — هنوز سراغ تأمین‌کننده نرفته بودیم */
  async abandonBooking(intent: PaymentIntent): Promise<void> {
    await this.prisma.flightBooking.updateMany({
      where: { intentId: intent.id, status: 'AWAITING_PAYMENT' },
      data: { status: 'EXPIRED' },
    });
  }

  private async issueApproved(
    id: string,
    authorizedAmount: number,
    result: ProviderReservation,
  ): Promise<void> {
    if (result.totalAmount === undefined)
      throw new Error('Approved reservation has no final amount');
    if (result.totalAmount > authorizedAmount) {
      // Capacity is only held: do not issue above the amount the user approved.
      await this.refund(id, 'مبلغ نهایی پرواز از پیش‌فاکتور بیشتر شد');
      return;
    }
    if (result.totalAmount < authorizedAmount)
      await this.adjustAmount(id, result.totalAmount);
    const booked = await this.provider.book(result.confirmationCode);
    if (booked.confirmationCode !== result.confirmationCode)
      throw new Error('Confirmation mismatch');
    await this.applyStatus(id, booked);
  }
  private async adjustAmount(id: string, finalAmount: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const booking = await tx.flightBooking.findUniqueOrThrow({
        where: { id },
      });
      const amount = BigInt(finalAmount);
      if (amount >= booking.amount) return;
      const difference = booking.amount - amount;
      const claimed = await tx.flightBooking.updateMany({
        where: {
          id,
          amount: booking.amount,
          refunded: false,
          status: { in: ['PROCESSING', 'REVIEW'] },
        },
        data: { amount },
      });
      if (claimed.count !== 1) return;
      await this.giveBack(tx, booking, difference, `بازگشت مابه‌التفاوت قیمت پرواز — ${id}`);
    });
  }
  private async applyStatus(
    id: string,
    result: ProviderReservation,
  ): Promise<void> {
    if (result.status === 'booked') {
      await this.prisma.flightBooking.updateMany({
        where: {
          id,
          status: { in: ['PROCESSING', 'REVIEW'] },
          refunded: false,
        },
        data: {
          status: 'CONFIRMED',
          tickets: result.tickets as unknown as Prisma.InputJsonValue,
        },
      });
    } else if (result.status === 'rejected') {
      await this.refund(id, 'رزرو پرواز از سوی تأمین‌کننده رد شد');
    } else {
      // The collection documents booked/booking/rejected. Preserve unfamiliar states for review.
      await this.prisma.flightBooking.updateMany({
        where: { id, status: { in: ['PROCESSING', 'REVIEW'] } },
        data: { status: result.status === 'booking' ? 'PROCESSING' : 'REVIEW' },
      });
    }
  }
  private async refund(id: string, note: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const b = await tx.flightBooking.findUniqueOrThrow({ where: { id } });
      const claimed = await tx.flightBooking.updateMany({
        where: {
          id,
          refunded: false,
          status: { in: ['PROCESSING', 'REVIEW'] },
        },
        data: { refunded: true, status: 'REJECTED' },
      });
      if (claimed.count !== 1) return;
      await this.giveBack(tx, b, b.amount, `${note} — ${id}`);
    });
  }

  /**
   * برگشت پول یک رزرو: رزروهای UPG از طریق UPG (اول سهم کارت، بعد اعتبار)،
   * رزروهای قبل از UPG مستقیم به همان کیف پول.
   */
  private async giveBack(
    tx: Prisma.TransactionClient,
    booking: { employeeId: string; allocationId: string | null; intentId: string | null },
    amount: bigint,
    note: string,
  ): Promise<void> {
    if (booking.intentId) {
      await this.upg.refund(booking.intentId, amount, note, tx);
      return;
    }
    if (!booking.allocationId) return;
    await tx.walletAllocation.update({
      where: { id: booking.allocationId },
      data: { spent: { decrement: amount } },
    });
    await tx.transaction.create({
      data: {
        type: 'REFUND',
        employeeId: booking.employeeId,
        allocationId: booking.allocationId,
        amount,
        note,
      },
    });
  }
  async receipt(employeeId: string, id: string): Promise<FlightBookingReceipt> {
    const b = await this.prisma.flightBooking.findFirst({
      where: { id, employeeId },
      include: { quote: true, allocation: { include: { definition: true } } },
    });
    if (!b) throw new NotFoundException('رزرو پیدا نشد');
    return {
      tickets: b.tickets as unknown as FlightTicket[],
      id: b.id,
      confirmationCode: b.confirmationCode,
      status: b.status as FlightBookingStatus,
      offer: b.quote.offer as unknown as FlightOffer,
      amount: Number(b.amount),
      refunded: b.refunded,
      walletName: b.allocation
        ? b.allocation.definition.name
        : b.intentId
          ? [
              ...new Set(
                (await this.upg.paidSources(b.intentId)).map((s) => s.name),
              ),
            ].join(' + ')
          : '',
      createdAt: b.createdAt.toISOString(),
    };
  }
  async myBookings(employeeId: string): Promise<FlightBookingReceipt[]> {
    const rows = await this.prisma.flightBooking.findMany({
      where: { employeeId, status: { notIn: ['AWAITING_PAYMENT', 'EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true },
    });
    return Promise.all(rows.map((b) => this.receipt(employeeId, b.id)));
  }
  @Interval(10000)
  async reconcile(): Promise<void> {
    if (this.polling || process.env.FLIGHT_MODE !== 'live') return;
    this.polling = true;
    try {
      const rows = await this.prisma.flightBooking.findMany({
        where: {
          status: { in: ['PROCESSING', 'REVIEW'] },
          confirmationCode: { not: null },
          updatedAt: { lt: new Date(Date.now() - 10000) },
        },
        take: 20,
        orderBy: { updatedAt: 'asc' },
      });
      for (const b of rows) {
        try {
          const result = await this.provider.inquiry(b.confirmationCode ?? '');
          if (result.status === 'approved') {
            await this.issueApproved(b.id, Number(b.amount), result);
          } else {
            await this.applyStatus(b.id, result);
          }
        } catch {
          this.logger.warn(`Flight inquiry deferred: ${b.id}`);
        }
      }
    } catch {
      this.logger.warn('Flight reconciliation unavailable');
    } finally {
      this.polling = false;
    }
  }
}

export function isValidIranianNationalCode(value: string): boolean {
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const remainder =
    digits.slice(0, 9).reduce((sum, digit, index) => {
      return sum + digit * (10 - index);
    }, 0) % 11;
  const checkDigit = remainder < 2 ? remainder : 11 - remainder;
  return digits[9] === checkDigit;
}
