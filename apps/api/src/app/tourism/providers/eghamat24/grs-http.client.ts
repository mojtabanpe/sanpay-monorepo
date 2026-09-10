/**
 * کلاینت واقعی اقامت۲۴ / GRS.
 *
 * تفاوت‌های ساختاری‌اش با هتل‌یار — که شکل این فایل را تعیین کرده‌اند:
 *
 * - **سشن ندارد.** احراز هویت یک هدر ثابت `Client-Token` است، پس نه login
 *   لازم است، نه کش سشن، نه تلاش مجدد بعد از انقضا. کل آن منطق در
 *   `GdsHttpClient` اینجا حذف می‌شود.
 * - **REST واقعی است:** خواندن با GET و پارامتر در query، نوشتن با POST و بدنهٔ
 *   JSON. کد وضعیت HTTP معنادار است (۴۰۳ توکن بد، ۴۲۲ خطای اعتبارسنجی).
 * - **ولی کد وضعیت کافی نیست:** خطای موجودی با HTTP 200 و فقط داخل `errors[]`
 *   برمی‌گردد (نمونهٔ صفحهٔ ۶ داکیومنت v1.18.4). پس هر پاسخ از دو جهت بررسی
 *   می‌شود: کد HTTP و بعد محتوای `errors`/`error`.
 * - قیمت‌ها ریال‌اند؛ تبدیل به تومان کارِ `eghamat24.mapper` است و اینجا هیچ
 *   عددی دست‌کاری نمی‌شود.
 *
 * ⚠ **مسیرها هنوز روی سرویس واقعی تأیید نشده‌اند.** داکیومنتی که داریم فقط دو
 * مسیر را عیناً نشان می‌دهد (`/v1/cities` و `POST /v1/book`)؛ بقیه از روی نام
 * سرویس‌ها و همان الگو نوشته شده‌اند. همه در `ENDPOINTS` پایین جمع‌اند تا با
 * یک بار اجرای `pnpm grs:check` از داخل ایران هر کدام که ۴۰۴ داد در یک نقطه
 * اصلاح شود — نه اینکه در ده متد پخش باشد.
 */

import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GrsCity,
  GrsClient,
  GrsEnvelope,
  GrsError,
  GrsProperty,
  GrsPropertyDetails,
  GrsReserveDetails,
  GrsReserveRequest,
  GrsRoomRate,
  GrsSuggestion,
  GrsSuggestionParams,
} from './grs.types';

/**
 * مسیرهای سرویس. `{id}` و `{code}` قبل از فراخوانی جایگزین می‌شوند.
 *
 * وضعیت هر مسیر:
 *   ✓ = عیناً در داکیومنت آمده        ? = از روی نام سرویس نوشته شده
 */
const ENDPOINTS = {
  /* ✓ */ cities: 'cities',
  /* ? */ properties: 'properties',
  /* ? */ propertyDetails: 'properties/{id}',
  /* ? */ availableRooms: 'available-rooms',
  /* ? */ suggestion: 'suggestion',
  /* ? */ reserve: 'reserve',
  /* ✓ */ book: 'book',
  /* ? */ reserveDetails: 'reserve/{code}',
  /* ? */ cancel: 'cancel',
  /* ? */ acceptCancel: 'accept-cancel',
  /* ? */ rejectCancel: 'reject-cancel',
} as const;

/**
 * پیام فارسی برای خطاهای شناخته‌شدهٔ GRS.
 *
 * کلید، `name` داخل `errors[]` است نه کد عددی — GRS خطاها را نام‌گذاری می‌کند
 * (نمونهٔ داکیومنت: `{name: "inventory"}`). هر نام ناشناخته با پیام خودِ سرویس
 * بالا می‌رود تا اپراتور دست‌کم متن اصلی را ببیند.
 */
const ERROR_MESSAGES: Record<string, string> = {
  inventory: 'ظرفیت این اتاق برای تاریخ انتخابی تکمیل شده است',
  closed: 'اقامتگاه در این تاریخ پذیرش ندارد',
  min_stay: 'مدت اقامت از حداقل شب‌های مجاز کمتر است',
  max_stay: 'مدت اقامت از حداکثر شب‌های مجاز بیشتر است',
  price: 'قیمت این اتاق تغییر کرده است؛ دوباره جست‌وجو کنید',
  expired: 'مهلت نهایی‌سازی این رزرو تمام شده است',
  duplicate: 'این رزرو قبلاً ثبت شده است',
};

const TIMEOUT_MS = 20_000;

@Injectable()
export class GrsHttpClient extends GrsClient {
  private readonly logger = new Logger(GrsHttpClient.name);

  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    super();
    // `GRS_URL` فقط میزبان است (`https://hotel-test-01.denv.ir`)؛ نسخهٔ API
    // را خودمان اضافه می‌کنیم تا با عوض‌شدن محیط تست/اصلی دست‌نخورده بماند.
    this.baseUrl = `${(process.env.GRS_URL ?? '').replace(/\/+$/, '')}/v1`;
    this.token = process.env.GRS_TOKEN ?? '';

    if (!process.env.GRS_URL || !this.token) {
      throw new Error(
        'GRS_URL / GRS_TOKEN تنظیم نشده‌اند. برای کار بدون توکن GRS_MODE=mock بگذارید.',
      );
    }

    this.logger.log(`اقامت۲۴: حالت واقعی — ${this.baseUrl}`);
  }

  async getCities(): Promise<GrsCity[]> {
    return (await this.get<GrsCity[]>(ENDPOINTS.cities)) ?? [];
  }

  async getProperties(cityId: number | null): Promise<GrsProperty[]> {
    return (
      (await this.get<GrsProperty[]>(ENDPOINTS.properties, {
        city_id: cityId,
      })) ?? []
    );
  }

  /** ملک ناموجود `null` می‌دهد، نه خطا — تصمیمش با provider است */
  async getPropertyDetails(
    propertyId: number,
  ): Promise<GrsPropertyDetails | null> {
    return this.get<GrsPropertyDetails>(
      ENDPOINTS.propertyDetails.replace('{id}', String(propertyId)),
      undefined,
      { notFoundAsNull: true },
    );
  }

  async getAvailableRooms(
    propertyId: number,
    checkIn: string,
    checkOut: string,
  ): Promise<GrsRoomRate[]> {
    return (
      (await this.get<GrsRoomRate[]>(ENDPOINTS.availableRooms, {
        property_id: propertyId,
        check_in: checkIn,
        check_out: checkOut,
      })) ?? []
    );
  }

  async suggestion(params: GrsSuggestionParams): Promise<GrsSuggestion[]> {
    return (
      (await this.get<GrsSuggestion[]>(ENDPOINTS.suggestion, {
        city_id: params.cityId,
        property_id: params.propertyId,
        check_in: params.checkIn,
        check_out: params.checkOut,
        adults_count: params.adultsCount,
        // ۰ یعنی بدون فیلتر ستاره — همان قراردادی که provider دارد
        star: params.star || null,
      })) ?? []
    );
  }

  async reserve(request: GrsReserveRequest): Promise<GrsReserveDetails> {
    return this.post<GrsReserveDetails>(ENDPOINTS.reserve, request);
  }

  async book(confirmationCode: string): Promise<GrsReserveDetails> {
    return this.post<GrsReserveDetails>(ENDPOINTS.book, {
      confirmation_code: confirmationCode,
    });
  }

  async reserveDetails(
    confirmationCode: string,
  ): Promise<GrsReserveDetails | null> {
    return this.get<GrsReserveDetails>(
      ENDPOINTS.reserveDetails.replace(
        '{code}',
        encodeURIComponent(confirmationCode),
      ),
      undefined,
      { notFoundAsNull: true },
    );
  }

  async cancel(confirmationCode: string): Promise<GrsReserveDetails> {
    return this.post<GrsReserveDetails>(ENDPOINTS.cancel, {
      confirmation_code: confirmationCode,
    });
  }

  async acceptCancel(confirmationCode: string): Promise<GrsReserveDetails> {
    return this.post<GrsReserveDetails>(ENDPOINTS.acceptCancel, {
      confirmation_code: confirmationCode,
    });
  }

  async rejectCancel(confirmationCode: string): Promise<GrsReserveDetails> {
    return this.post<GrsReserveDetails>(ENDPOINTS.rejectCancel, {
      confirmation_code: confirmationCode,
    });
  }

  // ── لایهٔ انتقال ───────────────────────────────────────────────────────────

  private get<T>(
    path: string,
    query?: Record<string, string | number | null>,
    options?: { notFoundAsNull?: boolean },
  ): Promise<T | null> {
    return this.request<T>('GET', path, { query, ...options });
  }

  /** نوشتن هیچ‌وقت `null` قابل قبول نیست: رزروِ بی‌پاسخ یعنی خطا */
  private async post<T>(path: string, body: object): Promise<T> {
    const value = await this.request<T>('POST', path, { body });

    if (value === null) {
      throw new BadGatewayException(
        'سامانهٔ رزرو هتل پاسخ خالی داد؛ وضعیت رزرو نامشخص است',
      );
    }
    return value;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: {
      query?: Record<string, string | number | null>;
      body?: object;
      notFoundAsNull?: boolean;
    },
  ): Promise<T | null> {
    const url = new URL(`${this.baseUrl}/${path}`);

    // پارامتر null اصلاً فرستاده نمی‌شود؛ `city_id=` خالی را GRS خطای
    // اعتبارسنجی می‌دهد، در حالی که نبودنش یعنی «بدون فیلتر».
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Client-Token': this.token,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (cause) {
      this.logger.error(`ارتباط با اقامت۲۴ برقرار نشد (${path})`, cause);
      throw new ServiceUnavailableException(
        'ارتباط با سامانهٔ رزرو هتل برقرار نشد؛ کمی بعد دوباره تلاش کنید',
      );
    }

    if (response.status === 403 || response.status === 401) {
      // توکن اشتباه یا باطل‌شده؛ کارمند نباید پیام فنی ببیند ولی لاگ باید صریح
      // باشد چون تنها راه تشخیصش همین است.
      this.logger.error(`اقامت۲۴ توکن را نپذیرفت (HTTP ${response.status})`);
      throw new ForbiddenException('دسترسی به سامانهٔ رزرو هتل برقرار نیست');
    }

    if (response.status === 404 && options.notFoundAsNull) {
      return null;
    }

    const raw = await response.text();
    let envelope: GrsEnvelope<T> | null = null;
    try {
      envelope = JSON.parse(raw) as GrsEnvelope<T>;
    } catch {
      envelope = null;
    }

    // بدنهٔ غیر JSON فقط وقتی پیش می‌آید که مسیر اشتباه باشد یا سرویس بالا
    // نیامده باشد؛ متن خام در لاگ می‌ماند چون همان چیزی است که مسیر را لو می‌دهد.
    if (!envelope || typeof envelope !== 'object') {
      this.logger.error(
        `پاسخ غیرمنتظرهٔ اقامت۲۴ (${method} ${path}, HTTP ${response.status}): ${raw.slice(0, 300)}`,
      );
      throw new BadGatewayException(
        `سامانهٔ رزرو هتل پاسخ نامعتبر داد (HTTP ${response.status})`,
      );
    }

    const errors = errorsOf(envelope);

    if (errors.length > 0) {
      throw new GrsRequestError(errors, envelope.message);
    }

    // خطای بدون `errors[]` — مثلاً ۴۲۲ اعتبارسنجی با فقط `message`
    if (!response.ok) {
      this.logger.warn(
        `خطای اقامت۲۴ (${method} ${path}, HTTP ${response.status}): ${envelope.message}`,
      );
      throw new GrsRequestError([], envelope.message);
    }

    return envelope.value ?? null;
  }
}

/** داکیومنت هر دو املای `errors` و `error` را نشان می‌دهد */
function errorsOf(envelope: GrsEnvelope<unknown>): GrsError[] {
  return [...(envelope.errors ?? []), ...(envelope.error ?? [])];
}

/**
 * خطای سطح پروتکل GRS.
 *
 * `names` نگه داشته می‌شود تا فراخواننده بتواند تصمیم بگیرد — مثلاً `inventory`
 * یعنی «این اتاق را نفروش» و باید متفاوت از یک خطای موقت شبکه رفتار شود.
 */
export class GrsRequestError extends Error {
  readonly names: string[];

  constructor(errors: GrsError[], fallback?: string) {
    const known = errors.find((error) => ERROR_MESSAGES[error.name]);
    super(
      (known && ERROR_MESSAGES[known.name]) ||
        errors[0]?.message ||
        fallback ||
        'خطای سامانهٔ رزرو هتل',
    );
    this.names = errors.map((error) => error.name);
  }
}
