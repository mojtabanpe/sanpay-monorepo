import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingQuote,
  BookingReceipt,
  PreviousTraveler,
  BookingStatus,
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
  TourismWallet,
} from '@sanpay/models';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto, SearchHotelsDto } from './dto/tourism.dto';
import { HotelProviderRouter } from './providers/hotel-provider.router';
import {
  PROVIDER_NAMES,
  ProviderKey,
  providerOf,
  sameProvider,
} from './providers/provider-id';

@Injectable()
export class TourismService {
  private readonly logger = new Logger(TourismService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: HotelProviderRouter,
  ) {}

  /** شهرهای هر دو تأمین‌کننده، با اعمال قاعدهٔ «مشهد → اقامت۲۴» */
  cities(): Promise<TourismCity[]> {
    return this.providers.cities();
  }

  /**
   * فهرست هتل‌ها. `cityId` نداده یعنی همهٔ شهرها، که یعنی هر دو تأمین‌کننده.
   *
   * وقتی شهر مشخص است فقط یک تأمین‌کننده صدا زده می‌شود — شناسهٔ شهر خودش
   * می‌گوید کدام.
   */
  async hotels(cityId: string | null): Promise<HotelSummary[]> {
    if (cityId) {
      return this.providers.forId(cityId).hotels(cityId);
    }

    const lists = await Promise.all(
      this.providers
        .all()
        .map((provider) =>
          this.safe(provider.key, () => provider.hotels(null)),
        ),
    );

    // شهرهای مشهدِ هتل‌یار نباید در فهرست «همهٔ شهرها» بیایند، وگرنه کارمند
    // هتلی از مشهد می‌بیند که قرار بوده از اقامت۲۴ بیاید
    return lists
      .flat()
      .filter(
        (hotel) =>
          providerOf(hotel.id) === 'eg' ||
          !this.providers.servedByEghamat24(hotel.cityName),
      );
  }

  async hotel(hotelId: string): Promise<HotelDetail> {
    const hotel = await this.providers.forId(hotelId).hotel(hotelId);
    if (!hotel) {
      throw new NotFoundException('هتل پیدا نشد');
    }
    return hotel;
  }

  /** جست‌وجوی اتاق خالی — تاریخ گذشته همین‌جا رد می‌شود، نه در تأمین‌کننده */
  async search(dto: SearchHotelsDto): Promise<HotelAvailability[]> {
    this.assertFutureDate(dto.checkin);

    const params = {
      checkin: dto.checkin,
      nights: dto.nights,
      hotelId: dto.hotelId ?? null,
      cityId: dto.cityId ?? null,
      rate: dto.rate,
      capacity: dto.capacity,
    };

    // هتل یا شهر مشخص → فقط همان تأمین‌کننده
    const scope = dto.hotelId ?? dto.cityId;
    if (scope) {
      return this.providers.forId(scope).search(params);
    }

    // جست‌وجوی سراسری: هر دو موازی. شکست یکی نباید نتیجهٔ دیگری را از بین
    // ببرد — کارمندی که دنبال هتل شیراز است نباید به‌خاطر قطعی اقامت۲۴ دست
    // خالی برگردد.
    const results = await Promise.all(
      this.providers
        .all()
        .map((provider) =>
          this.safe(provider.key, () => provider.search(params)),
        ),
    );

    return results.flat();
  }

  /** پیش‌فاکتور: قیمت اتاق + کیف‌پول‌های گردشگری قابل استفاده */
  async quote(
    employeeId: string,
    hotelId: string,
    roomId: string,
    checkin: string,
    nights: number,
  ): Promise<BookingQuote> {
    sameProvider(hotelId, roomId);

    const [availability] = await this.search({
      checkin,
      nights,
      hotelId,
      rate: 0,
      capacity: 1,
    });

    const room = availability?.rooms.find((item) => item.roomId === roomId);
    if (!room) {
      throw new NotFoundException(
        'این اتاق در تاریخ انتخابی موجود نیست؛ تاریخ دیگری را امتحان کنید',
      );
    }

    const wallets = await this.tourismWallets(employeeId);

    return {
      hotelId: availability.hotelId,
      hotelName: availability.hotelName,
      room,
      checkin: availability.checkin,
      checkout: availability.checkout,
      nights: availability.nights,
      amount: room.price,
      wallets,
      totalAvailable: wallets.reduce((sum, wallet) => sum + wallet.max, 0),
    };
  }

  /**
   * ثبت رزرو.
   *
   * ترتیب عمداً این است و برای هر دو تأمین‌کننده یکی است:
   *
   *   ۱. ظرفیت و اعتبار چک می‌شود
   *   ۲. رکورد رزرو **قبل از** تماس با تأمین‌کننده نوشته می‌شود
   *   ۳. رزرو نزد تأمین‌کننده ثبت می‌شود
   *   ۴. فقط اگر موفق بود، اعتبار کارمند کم می‌شود
   *   ۵. اگر تأمین‌کننده رزرو را فقط «نگه داشته» بود (HOLD)، حالا نهایی می‌شود
   *
   * چرا کسر اعتبار بعد از رزرو: برعکسش یعنی هر خطای شبکه‌ای اعتبار کارمند را
   * می‌سوزاند بدون اینکه اتاقی گرفته شده باشد.
   *
   * چرا رکورد قبل از تماس: اگر رزرو نزد تأمین‌کننده موفق شود ولی نوشتن در
   * دیتابیس شکست بخورد، رزروی داریم که پولش کم نشده. رکوردِ PENDING با
   * `transactionId: null` باعث می‌شود چنین موردی در گزارش تسویه پیدا شود، نه
   * اینکه بی‌صدا گم شود.
   */
  async book(
    employeeId: string,
    dto: CreateBookingDto,
  ): Promise<BookingReceipt> {
    this.assertFutureDate(dto.checkin);

    const providerKey = sameProvider(dto.hotelId, dto.roomId);
    const provider = this.providers.byKey(providerKey);

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException('کارمند پیدا نشد');
    }

    const quote = await this.quote(
      employeeId,
      dto.hotelId,
      dto.roomId,
      dto.checkin,
      dto.nights,
    );

    const allocation = await this.assertUsableWallet(
      employeeId,
      dto.allocationId,
      quote.amount,
    );

    const referenceNo = await this.nextReferenceNo();

    const booking = await this.prisma.hotelBooking.create({
      data: {
        referenceNo,
        provider: providerKey,
        status: 'PENDING',
        employeeId,
        allocationId: allocation.id,
        hotelId: quote.hotelId,
        hotelName: quote.hotelName,
        roomId: quote.room.roomId,
        roomType: quote.room.roomType,
        checkin: new Date(`${quote.checkin}T00:00:00Z`),
        nights: quote.nights,
        guestName: `${dto.guest.firstName} ${dto.guest.lastName}`,
        guestIdNo: dto.guest.nationalCode,
        guestFirstName: dto.guest.firstName,
        guestLastName: dto.guest.lastName,
        guestMobile: dto.guest.mobile,
        amount: BigInt(quote.amount),
        payable: BigInt(quote.amount),
      },
    });

    const reserved = await provider
      .reserve({
        hotelId: dto.hotelId,
        roomId: dto.roomId,
        checkin: dto.checkin,
        nights: dto.nights,
        guest: dto.guest,
        referenceNo,
      })
      .catch(async (error) => {
        await this.prisma.hotelBooking.update({
          where: { id: booking.id },
          data: { status: 'REJECTED' },
        });
        throw error;
      });

    if (reserved.status === 'REJECTED') {
      await this.prisma.hotelBooking.update({
        where: { id: booking.id },
        data: {
          status: 'REJECTED',
          providerReserveId: reserved.reserveRef || null,
          statusNote: reserved.message,
        },
      });
      throw new BadRequestException(
        reserved.message ?? 'رزرو از سوی هتل پذیرفته نشد',
      );
    }

    // رزرو گرفته شد → حالا اعتبار کم می‌شود
    const debited = await this.debit(
      booking.id,
      employeeId,
      allocation.id,
      quote.amount,
      quote.hotelName,
      referenceNo,
      reserved,
    );

    // HOLD یعنی اتاق فقط نگه داشته شده و تا وقتی نهایی نکنیم رزرو نیست
    const status =
      reserved.status === 'HOLD'
        ? await this.finalizeHold(booking.id, providerKey, reserved.reserveRef)
        : reserved.status;

    return this.receipt(
      { ...debited.booking, status },
      allocation.definition.name,
      debited.remainingAfter,
      quote.checkin,
      quote.checkout,
    );
  }

  /**
   * آخرین مشخصات یکتای مسافرانی که این کارمند قبلاً برایشان رزرو کرده است.
   * رزروهای قدیمی که شمارهٔ موبایل نداشتند عمداً برگردانده نمی‌شوند، چون فرم
   * کامل رزرو را نمی‌توان با دادهٔ ناقص پر کرد.
   */
  async previousTravelers(employeeId: string): Promise<PreviousTraveler[]> {
    const bookings = await this.prisma.hotelBooking.findMany({
      where: {
        employeeId,
        guestFirstName: { not: null },
        guestLastName: { not: null },
        guestMobile: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        guestFirstName: true,
        guestLastName: true,
        guestIdNo: true,
        guestMobile: true,
        createdAt: true,
      },
    });

    const travelers = new Map<string, PreviousTraveler>();
    for (const booking of bookings) {
      const { guestFirstName, guestLastName, guestMobile } = booking;
      if (!guestFirstName || !guestLastName || !guestMobile) continue;
      if (travelers.has(booking.guestIdNo)) continue;
      travelers.set(booking.guestIdNo, {
        firstName: guestFirstName,
        lastName: guestLastName,
        nationalCode: booking.guestIdNo,
        mobile: guestMobile,
        lastUsedAt: booking.createdAt.toISOString(),
      });
      if (travelers.size === 10) break;
    }
    return [...travelers.values()];
  }

  /**
   * نهایی‌سازی رزروِ HOLD بعد از کسر اعتبار.
   *
   * اگر این مرحله شکست بخورد، اعتبار کم شده ولی رزروی نداریم — پس **پول برگشت
   * می‌خورد** و رزرو REJECTED می‌شود. رزروِ نگه‌داشته‌شده نزد تأمین‌کننده خودش
   * با پایان مهلت آزاد می‌شود، پس چیزی معلق نمی‌ماند.
   */
  private async finalizeHold(
    bookingId: string,
    providerKey: ProviderKey,
    reserveRef: string,
  ): Promise<BookingStatus> {
    try {
      const confirmed = await this.providers
        .byKey(providerKey)
        .confirm(reserveRef);

      await this.prisma.hotelBooking.update({
        where: { id: bookingId },
        data: { status: confirmed.status, holdExpiresAt: null },
      });
      return confirmed.status;
    } catch (error) {
      this.logger.error(
        `نهایی‌سازی رزرو ${bookingId} نزد ${PROVIDER_NAMES[providerKey]} شکست خورد — اعتبار برگشت داده می‌شود`,
        error instanceof Error ? error.stack : String(error),
      );

      await this.refund(
        bookingId,
        'نهایی‌سازی رزرو نزد تأمین‌کننده انجام نشد؛ مبلغ برگشت داده شد',
      );

      throw new BadRequestException(
        'رزرو در مهلت مقرر نهایی نشد؛ مبلغ به کیف پول شما برگشت. لطفاً دوباره تلاش کنید',
      );
    }
  }

  /** کسر اعتبار + ثبت تراکنش، اتمیک و مقاوم در برابر رزرو هم‌زمان */
  private async debit(
    bookingId: string,
    employeeId: string,
    allocationId: string,
    amount: number,
    hotelName: string,
    referenceNo: string,
    reserved: {
      status: string;
      reserveRef: string;
      payable: number | null;
      expiresAt: Date | null;
      message: string | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.walletAllocation.findUniqueOrThrow({
        where: { id: allocationId },
      });
      const remaining = current.cap - current.spent;

      if (BigInt(amount) > remaining) {
        throw new BadRequestException(
          'ماندهٔ کیف پول گردشگری کافی نیست؛ رزرو ثبت شد اما پرداخت انجام نشد — با پشتیبانی تماس بگیرید',
        );
      }

      // شرط spent در where: دو رزرو هم‌زمان نمی‌توانند از یک مانده بیش از حد بردارند
      const updated = await tx.walletAllocation.updateMany({
        where: { id: current.id, spent: current.spent },
        data: { spent: current.spent + BigInt(amount) },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'ماندهٔ کیف پول هم‌زمان تغییر کرد؛ لطفاً دوباره تلاش کنید',
        );
      }

      const transaction = await tx.transaction.create({
        data: {
          type: 'PURCHASE',
          amount: BigInt(amount),
          employeeId,
          allocationId: current.id,
          note: `رزرو هتل ${hotelName} — پیگیری ${referenceNo}`,
        },
      });

      const booking = await tx.hotelBooking.update({
        where: { id: bookingId },
        data: {
          status: reserved.status as BookingStatus,
          providerReserveId: reserved.reserveRef || null,
          holdExpiresAt: reserved.expiresAt,
          transactionId: transaction.id,
          payable: BigInt(reserved.payable ?? amount),
          statusNote: reserved.message,
        },
      });

      return {
        booking,
        remainingAfter: Number(remaining - BigInt(amount)),
      };
    });
  }

  /**
   * برگشت مبلغ به کیف پول.
   *
   * `refundedAmount` نگهبان یکتایی است: اگر قبلاً پر شده باشد یعنی این رزرو
   * یک‌بار برگشت خورده و دومین تلاش بی‌اثر می‌ماند. بدون این، یک retry می‌توانست
   * دوبار اعتبار برگرداند.
   */
  private async refund(bookingId: string, note: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const booking = await tx.hotelBooking.findUniqueOrThrow({
        where: { id: bookingId },
      });

      if (booking.refundedAmount !== null || booking.transactionId === null) {
        return;
      }

      await tx.walletAllocation.update({
        where: { id: booking.allocationId },
        data: { spent: { decrement: booking.amount } },
      });

      await tx.transaction.create({
        data: {
          type: 'REFUND',
          amount: booking.amount,
          employeeId: booking.employeeId,
          allocationId: booking.allocationId,
          note: `${note} — پیگیری ${booking.referenceNo}`,
        },
      });

      await tx.hotelBooking.update({
        where: { id: bookingId },
        data: {
          status: 'REJECTED',
          refundedAmount: booking.amount,
          canceledAt: new Date(),
          statusNote: note,
        },
      });
    });
  }

  /** رزروهای کارمند، تازه‌ترین اول */
  async myBookings(employeeId: string): Promise<BookingReceipt[]> {
    const bookings = await this.prisma.hotelBooking.findMany({
      where: { employeeId, transactionId: { not: null } },
      include: { allocation: { include: { definition: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return bookings.map((booking) => {
      const checkin = booking.checkin.toISOString().slice(0, 10);
      return this.receipt(
        booking,
        booking.allocation.definition.name,
        Number(booking.allocation.cap - booking.allocation.spent),
        checkin,
        addDays(checkin, booking.nights),
      );
    });
  }

  private receipt(
    booking: {
      id: string;
      referenceNo: string;
      provider: string;
      status: string;
      hotelName: string;
      roomType: string;
      nights: number;
      guestName: string;
      amount: bigint;
      statusNote?: string | null;
      refundedAmount?: bigint | null;
      cancellationFee?: bigint | null;
      holdExpiresAt?: Date | null;
      createdAt: Date;
    },
    walletName: string,
    remainingAfter: number,
    checkin: string,
    checkout: string,
  ): BookingReceipt {
    return {
      id: booking.id,
      referenceNo: booking.referenceNo,
      status: booking.status as BookingStatus,
      providerName: PROVIDER_NAMES[booking.provider as ProviderKey] ?? '',
      hotelName: booking.hotelName,
      roomType: booking.roomType,
      checkin,
      checkout,
      nights: booking.nights,
      guestName: booking.guestName,
      amount: Number(booking.amount),
      walletName,
      remainingAfter,
      statusNote: booking.statusNote ?? null,
      refundedAmount:
        booking.refundedAmount == null ? null : Number(booking.refundedAmount),
      cancellationFee:
        booking.cancellationFee == null
          ? null
          : Number(booking.cancellationFee),
      holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
      createdAt: booking.createdAt.toISOString(),
    };
  }

  /** کیف‌پول‌های گردشگری فعال و دارای مانده */
  private async tourismWallets(employeeId: string): Promise<TourismWallet[]> {
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

    return allocations
      .map((allocation) => ({
        allocationId: allocation.id,
        name: allocation.definition.name,
        icon: allocation.definition.icon,
        max: Number(allocation.cap - allocation.spent),
        expiresAt: allocation.expiresAt.toISOString(),
      }))
      .filter((wallet) => wallet.max > 0);
  }

  private async assertUsableWallet(
    employeeId: string,
    allocationId: string,
    amount: number,
  ) {
    const allocation = await this.prisma.walletAllocation.findUnique({
      where: { id: allocationId },
      include: { definition: true },
    });

    if (!allocation || allocation.employeeId !== employeeId) {
      throw new NotFoundException('کیف پول انتخاب‌شده پیدا نشد');
    }
    if (allocation.definition.kind !== 'TOURISM') {
      throw new BadRequestException(
        'رزرو هتل فقط با کیف پول گردشگری امکان‌پذیر است',
      );
    }
    if (!allocation.isActive || !allocation.definition.isActive) {
      throw new BadRequestException('کیف پول گردشگری غیرفعال است');
    }
    if (allocation.expiresAt <= new Date()) {
      throw new BadRequestException('اعتبار کیف پول گردشگری منقضی شده است');
    }
    if (BigInt(amount) > allocation.cap - allocation.spent) {
      throw new BadRequestException(
        'ماندهٔ کیف پول گردشگری برای این رزرو کافی نیست',
      );
    }
    return allocation;
  }

  private assertFutureDate(checkin: string): void {
    const today = new Date().toISOString().slice(0, 10);
    if (checkin < today) {
      throw new BadRequestException('تاریخ ورود نمی‌تواند قبل از امروز باشد');
    }
  }

  /** شمارهٔ پیگیری ۸ رقمی — همان کدی که به تأمین‌کننده می‌رود */
  private async nextReferenceNo(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = String(randomInt(10_000_000, 100_000_000));
      const clash = await this.prisma.hotelBooking.findUnique({
        where: { referenceNo: candidate },
        select: { id: true },
      });
      if (!clash) {
        return candidate;
      }
    }
    throw new BadRequestException('ثبت رزرو ناموفق بود؛ دوباره تلاش کنید');
  }

  /**
   * اجرای یک عملیات کاتالوگ که شکستش نباید کل نتیجه را از بین ببرد.
   *
   * فقط برای خواندن است — هیچ‌وقت دور رزرو یا کسر اعتبار نمی‌پیچد، چون آنجا
   * «بی‌صدا خالی برگرد» دقیقاً همان چیزی است که نباید بشود.
   */
  private async safe<T>(
    providerKey: ProviderKey,
    operation: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(
        `درخواست به ${PROVIDER_NAMES[providerKey]} ناموفق بود`,
        error instanceof Error ? error.stack : String(error),
      );
      return [];
    }
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
