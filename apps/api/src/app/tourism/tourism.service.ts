import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingQuote,
  BookingReceipt,
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
  TourismWallet,
} from '@sanpay/models';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto, SearchHotelsDto } from './dto/tourism.dto';
import { GdsClient } from './gds/gds.types';
import {
  addDays,
  toAvailability,
  toCity,
  toHotelDetail,
  toHotelSummary,
} from './tourism.mapper';

/** فهرست شهرها و هتل‌ها تقریباً ثابت است — کش کوتاه، جلوی رفت‌وبرگشت اضافه به GDS */
const CATALOG_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class TourismService {
  private readonly logger = new Logger(TourismService.name);

  private cityCache: { at: number; value: TourismCity[] } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gds: GdsClient,
  ) {}

  async cities(): Promise<TourismCity[]> {
    if (this.cityCache && Date.now() - this.cityCache.at < CATALOG_TTL_MS) {
      return this.cityCache.value;
    }
    const value = (await this.gds.getCities()).map(toCity);
    this.cityCache = { at: Date.now(), value };
    return value;
  }

  /** فهرست هتل‌های یک شهر (cityId = -1 یعنی همهٔ شهرها) */
  async hotels(cityId: number): Promise<HotelSummary[]> {
    const [hotels, cityNames] = await Promise.all([
      this.gds.getHotels(cityId),
      this.cityNames(),
    ]);
    return hotels.map((hotel) => toHotelSummary(hotel, cityNames));
  }

  async hotel(hotelId: number): Promise<HotelDetail> {
    const [hotel, cityNames] = await Promise.all([
      this.gds.getHotel(hotelId),
      this.cityNames(),
    ]);
    if (!hotel) {
      throw new NotFoundException('هتل پیدا نشد');
    }
    // گالری جدا از getHotel می‌آید؛ اگر خطا داد صفحهٔ هتل نباید بشکند
    const gallery = await this.gds
      .getHotelImages(hotelId)
      .then((images) => images.map((image) => image.url))
      .catch((error) => {
        this.logger.warn(`گالری هتل ${hotelId} دریافت نشد`, error);
        return [] as string[];
      });

    return toHotelDetail(hotel, cityNames, gallery);
  }

  /** جست‌وجوی اتاق‌های خالی — تاریخ گذشته همین‌جا رد می‌شود، نه در GDS */
  async search(dto: SearchHotelsDto): Promise<HotelAvailability[]> {
    this.assertFutureDate(dto.checkin);

    const results = await this.gds.searchHotel({
      checkin: dto.checkin,
      nights: dto.nights,
      hotelId: dto.hotelId,
      cityId: dto.cityId,
      rate: dto.rate,
      // capacityId=1 یعنی «ظرفیت مساوی یا بیشتر از مقدار خواسته‌شده»
      capacityId: 1,
      capacity: dto.capacity,
      person: dto.capacity,
      lang: 2,
      isForeigner: 0,
      detail: 0,
    });

    return results
      .map(toAvailability)
      .filter((availability) => availability.rooms.length > 0);
  }

  /** پیش‌فاکتور: قیمت اتاق + کیف‌پول‌های گردشگری قابل استفاده */
  async quote(
    employeeId: string,
    hotelId: number,
    roomId: number,
    checkin: string,
    nights: number,
  ): Promise<BookingQuote> {
    const [availability] = await this.search({
      checkin,
      nights,
      hotelId,
      cityId: -1,
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
   * ترتیب عمداً این است: اول ظرفیت و اعتبار را چک می‌کنیم، بعد **رزرو را در
   * هتل‌یار ثبت می‌کنیم**، و فقط اگر موفق بود اعتبار کارمند را کم می‌کنیم.
   * برعکسش (کسر اول) یعنی هر خطای شبکه‌ای اعتبار کارمند را می‌سوزاند بدون
   * اینکه اتاقی رزرو شده باشد.
   *
   * ریسک باقی‌مانده: اگر رزرو در هتل‌یار موفق شود ولی نوشتن در دیتابیس شکست
   * بخورد، رزروی داریم که پولش کم نشده. برای همین رکورد رزرو **قبل** از تماس
   * با هتل‌یار با وضعیت PENDING و transactionId=null ساخته می‌شود تا چنین
   * موردی در گزارش تسویه پیدا شود.
   */
  async book(
    employeeId: string,
    dto: CreateBookingDto,
  ): Promise<BookingReceipt> {
    this.assertFutureDate(dto.checkin);

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

    // رکورد «در حال ثبت» — اگر تماس با هتل‌یار نیمه‌کاره بماند، اثرش می‌ماند
    const booking = await this.prisma.hotelBooking.create({
      data: {
        referenceNo,
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
        amount: BigInt(quote.amount),
        payable: BigInt(quote.amount),
      },
    });

    const gdsResponse = await this.gds
      .book({
        firstname: dto.guest.firstName,
        lastname: dto.guest.lastName,
        email: '',
        tel: '',
        mobile: dto.guest.mobile,
        hotelId: dto.hotelId,
        externalId: referenceNo,
        checkin: dto.checkin,
        night: dto.nights,
        isForeigner: 0,
        passenger: [
          {
            roomId: String(dto.roomId),
            name: dto.guest.firstName,
            family: dto.guest.lastName,
            early: '0',
            late: '0',
            description: '',
            mobile: dto.guest.mobile,
            idNo: dto.guest.nationalCode,
            extraPerson: [],
          },
        ],
      })
      .catch(async (error) => {
        await this.prisma.hotelBooking.update({
          where: { id: booking.id },
          data: { status: 'REJECTED' },
        });
        throw error;
      });

    // statusCode 1 = ظرفیت آنلاین قطعی، 0 = آفلاین و در انتظار تأیید هتل‌یار
    const status = gdsResponse.statusCode === '1' ? 'CONFIRMED' : 'PENDING';
    // مبنای تسویهٔ شبانه، سهم هتل است نه مبلغی که از کارمند گرفتیم
    const payable = sumHotelPrice(gdsResponse) || quote.amount;

    // رزرو در هتل‌یار ثبت شد → حالا اعتبار کم می‌شود
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.walletAllocation.findUniqueOrThrow({
        where: { id: allocation.id },
      });
      const remaining = current.cap - current.spent;
      if (BigInt(quote.amount) > remaining) {
        throw new BadRequestException(
          'ماندهٔ کیف پول گردشگری کافی نیست؛ رزرو ثبت شد اما پرداخت انجام نشد — با پشتیبانی تماس بگیرید',
        );
      }

      // شرط spent در where: دو رزرو هم‌زمان نمی‌توانند از یک مانده بیش از حد بردارند
      const updated = await tx.walletAllocation.updateMany({
        where: { id: current.id, spent: current.spent },
        data: { spent: current.spent + BigInt(quote.amount) },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          'ماندهٔ کیف پول هم‌زمان تغییر کرد؛ لطفاً دوباره تلاش کنید',
        );
      }

      const transaction = await tx.transaction.create({
        data: {
          type: 'PURCHASE',
          amount: BigInt(quote.amount),
          employeeId,
          allocationId: current.id,
          note: `رزرو هتل ${quote.hotelName} — پیگیری ${referenceNo}`,
        },
      });

      const saved = await tx.hotelBooking.update({
        where: { id: booking.id },
        data: {
          status,
          gdsReserveId: gdsResponse.reserve?.info?.id ?? null,
          transactionId: transaction.id,
          payable: BigInt(payable),
        },
      });

      return {
        saved,
        remainingAfter: Number(remaining - BigInt(quote.amount)),
      };
    });

    return {
      id: result.saved.id,
      referenceNo: result.saved.referenceNo,
      status,
      hotelName: result.saved.hotelName,
      roomType: result.saved.roomType,
      checkin: quote.checkin,
      checkout: quote.checkout,
      nights: result.saved.nights,
      guestName: result.saved.guestName,
      amount: Number(result.saved.amount),
      walletName: allocation.definition.name,
      remainingAfter: result.remainingAfter,
      createdAt: result.saved.createdAt.toISOString(),
    };
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
      return {
        id: booking.id,
        referenceNo: booking.referenceNo,
        status: booking.status,
        hotelName: booking.hotelName,
        roomType: booking.roomType,
        checkin,
        checkout: addDays(checkin, booking.nights),
        nights: booking.nights,
        guestName: booking.guestName,
        amount: Number(booking.amount),
        walletName: booking.allocation.definition.name,
        remainingAfter: Number(
          booking.allocation.cap - booking.allocation.spent,
        ),
        statusNote: booking.statusNote,
        refundedAmount:
          booking.refundedAmount === null
            ? null
            : Number(booking.refundedAmount),
        createdAt: booking.createdAt.toISOString(),
      };
    });
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

  /** شمارهٔ پیگیری ۸ رقمی — همان externalId که به هتل‌یار می‌رود */
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

  private async cityNames(): Promise<Map<number, string>> {
    const cities = await this.cities();
    return new Map(cities.map((city) => [city.id, city.name]));
  }
}

/** جمع hotelPrice همهٔ شب‌ها و مسافرها — بدهی ما به هتل‌یار */
function sumHotelPrice(response: {
  reserve?: { passenger?: { dayPrice?: { hotelPrice: number }[] }[] };
}): number {
  return (response.reserve?.passenger ?? []).reduce(
    (total, passenger) =>
      total +
      (passenger.dayPrice ?? []).reduce(
        (sum, day) => sum + (day.hotelPrice ?? 0),
        0,
      ),
    0,
  );
}
