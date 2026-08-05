import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GdsBookRequest,
  GdsBookResponse,
  GdsCity,
  GdsClient,
  GdsEnvelope,
  GdsHotel,
  GdsHotelImage,
  GdsLoginResponse,
  GdsSearchParams,
  GdsSearchResult,
} from './gds.types';

/** پیام فارسی برای خطاهای شناخته‌شدهٔ GDS (جدول‌های error در داکیومنت v6.3) */
const ERROR_MESSAGES: Record<number, string> = {
  101: 'اطلاعات ارسالی ناقص است',
  103: 'قالب درخواست معتبر نیست',
  1000: 'خطای موقت سامانهٔ هتل — دوباره تلاش کنید',
  1034: 'تعداد تخت اضافهٔ درخواستی بیشتر از حد مجاز است',
  1043: 'تاریخ ورود نمی‌تواند قبل از امروز باشد',
  1101: 'احراز هویت سامانهٔ هتل ناموفق بود',
  5001: 'برای این اتاق قیمتی تعریف نشده است',
  8001: 'ظرفیتی برای خروج دیرهنگام موجود نیست',
  8002: 'ظرفیتی برای ورود زودهنگام موجود نیست',
  8004: 'ظرفیت این اتاق تکمیل شده است',
};

/** خطاهایی که یعنی سشن باید تازه شود و درخواست یک‌بار دیگر امتحان شود */
const SESSION_ERRORS = new Set([1104, 1107]);

/**
 * کلاینت واقعی هتل‌یار (WorldGDS).
 *
 * سشن یک ساعت اعتبار دارد و در حافظه نگه داشته می‌شود؛ هر درخواستی که با
 * خطای سشن برگردد یک‌بار با سشن تازه دوباره فرستاده می‌شود. چون login خودش
 * هزینه دارد، همهٔ درخواست‌های هم‌زمان روی یک Promise ورود مشترک منتظر می‌مانند.
 */
@Injectable()
export class GdsHttpClient extends GdsClient {
  private readonly logger = new Logger(GdsHttpClient.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly username: string;
  private readonly password: string;
  /** زبان پاسخ‌ها: ۱ انگلیسی، ۲ فارسی */
  private readonly lang = 2;

  private sessionId: string | null = null;
  private sessionExpiresAt = 0;
  private loginInFlight: Promise<string> | null = null;

  constructor() {
    super();
    this.baseUrl = (
      process.env.GDS_URL ?? 'https://apidemo.worldgds.com'
    ).replace(/\/+$/, '');
    this.apiKey = process.env.GDS_API_KEY ?? '';
    this.username = process.env.GDS_USERNAME ?? '';
    this.password = process.env.GDS_PASSWORD ?? '';

    if (!this.apiKey || !this.username || !this.password) {
      throw new Error(
        'GDS_API_KEY / GDS_USERNAME / GDS_PASSWORD تنظیم نشده‌اند. برای کار بدون کلید GDS_MODE=mock بگذارید.',
      );
    }

    this.logger.log(`هتل‌یار: حالت واقعی — ${this.baseUrl} (${this.username})`);
  }

  async getCities(): Promise<GdsCity[]> {
    return this.call<GdsCity[]>('getCity', { countryId: 1, lang: this.lang });
  }

  async getHotels(cityId: number): Promise<GdsHotel[]> {
    return this.call<GdsHotel[]>('getHotel', { cityId, lang: this.lang });
  }

  async getHotel(hotelId: number): Promise<GdsHotel | null> {
    // getHotel با hotelId فقط همان هتل را برمی‌گرداند؛ cityId=-1 یعنی همهٔ شهرها
    const hotels = await this.call<GdsHotel[]>('getHotel', {
      cityId: -1,
      hotelId,
      lang: this.lang,
    });
    return hotels.find((hotel) => Number(hotel.id) === hotelId) ?? null;
  }

  async getHotelImages(hotelId: number): Promise<GdsHotelImage[]> {
    const response = await this.call<{ list: GdsHotelImage[] }>(
      'getHotelImages',
      { hotelId },
    );
    return response?.list ?? [];
  }

  async searchHotel(params: GdsSearchParams): Promise<GdsSearchResult[]> {
    return this.call<GdsSearchResult[]>('searchHotel', {
      ...params,
      commission: 0,
    });
  }

  async book(request: GdsBookRequest): Promise<GdsBookResponse> {
    return this.call<GdsBookResponse>('book', { ...request });
  }

  /** یک فراخوانی GDS با تزریق sessionId و یک‌بار تلاش مجدد در صورت انقضای سشن */
  private async call<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const sessionId = await this.session();
    try {
      return await this.post<T>(method, { ...body, sessionId });
    } catch (error) {
      if (!(error instanceof GdsError) || !SESSION_ERRORS.has(error.code)) {
        throw error;
      }
      this.logger.warn(`سشن GDS منقضی شد (${error.code}) — ورود مجدد`);
      this.sessionId = null;
      const fresh = await this.session();
      return this.post<T>(method, { ...body, sessionId: fresh });
    }
  }

  private async post<T>(
    method: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${method}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          APIKEY: this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (cause) {
      this.logger.error(`ارتباط با هتل‌یار برقرار نشد (${method})`, cause);
      throw new ServiceUnavailableException(
        'ارتباط با سامانهٔ رزرو هتل برقرار نشد؛ کمی بعد دوباره تلاش کنید',
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        `سامانهٔ رزرو هتل پاسخ نامعتبر داد (HTTP ${response.status})`,
      );
    }

    const envelope = (await response.json()) as GdsEnvelope<T>;
    if (!envelope.status) {
      // خطاهای GDS با HTTP 200 برمی‌گردند؛ فقط status می‌گوید چه شده
      throw new GdsError(envelope.errorCode, envelope.description);
    }
    return envelope.response;
  }

  /** sessionId معتبر — از کش، وگرنه ورود تازه */
  private session(): Promise<string> {
    if (this.sessionId && Date.now() < this.sessionExpiresAt) {
      return Promise.resolve(this.sessionId);
    }
    // چند درخواست هم‌زمان نباید هرکدام یک login جدا بزنند
    this.loginInFlight ??= this.login().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async login(): Promise<string> {
    const result = await this.post<GdsLoginResponse>('login', {
      user: this.username,
      password: this.password,
    });
    this.sessionId = result.sessionId;
    this.sessionExpiresAt = expiryOf(result.expiredTime);
    return result.sessionId;
  }
}

/** ۵ دقیقه حاشیهٔ امن قبل از انقضای واقعی سشن */
const SESSION_MARGIN_MS = 5 * 60 * 1000;
/** اگر هتل‌یار expiredTime نداد: سشن یک ساعت اعتبار دارد */
const SESSION_FALLBACK_MS = 60 * 60 * 1000;

/**
 * زمان انقضای سشن از پاسخ login.
 *
 * `expiredTime` به شکل «YYYY-MM-DD HH:mm:ss» و به وقت سرور هتل‌یار می‌آید؛
 * چون منطقهٔ زمانی مشخص نیست، فقط وقتی به آن اعتماد می‌کنیم که در آینده و
 * زودتر از یک ساعت باشد — یعنی سشنی کوتاه‌تر از پیش‌فرض. هر حالت دیگری
 * (نبودن فیلد، فرمت ناشناخته، اختلاف ساعت سرور) به همان یک ساعت برمی‌گردد.
 */
function expiryOf(expiredTime: string | undefined): number {
  const now = Date.now();
  const fallback = now + SESSION_FALLBACK_MS - SESSION_MARGIN_MS;
  if (!expiredTime) {
    return fallback;
  }
  const parsed = Date.parse(expiredTime.trim().replace(' ', 'T'));
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  const withMargin = parsed - SESSION_MARGIN_MS;
  return withMargin > now && withMargin < fallback ? withMargin : fallback;
}

/** خطای سطح پروتکل GDS — با errorCode تا فراخواننده بتواند تصمیم بگیرد */
export class GdsError extends Error {
  constructor(
    readonly code: number,
    readonly description: string,
  ) {
    super(ERROR_MESSAGES[code] ?? description ?? 'خطای سامانهٔ رزرو هتل');
  }
}
