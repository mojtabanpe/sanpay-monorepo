import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FlightAirport,
  FlightBookingInput,
  FlightLeg,
  FlightOffer,
  FlightPassenger,
  FlightSearchInput,
  FlightTicket,
} from '@sanpay/models';

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadGatewayException('پاسخ نامعتبر سرویس پرواز');
  return value as Record<string, unknown>;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new BadGatewayException('پاسخ نامعتبر سرویس پرواز');
  return value;
}
function str(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new BadGatewayException('پاسخ نامعتبر سرویس پرواز');
  return value;
}
function optionalStr(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
function num(value: unknown): number {
  const n = typeof value === 'number' ? value : NaN;
  if (!Number.isSafeInteger(n) || n < 0)
    throw new BadGatewayException('مبلغ یا ظرفیت نامعتبر سرویس پرواز');
  return n;
}
export function flightAmount(
  price: Record<string, unknown>,
  search: FlightSearchInput,
  currency: string,
): number {
  if (currency !== 'IRR' && currency !== 'IRT')
    throw new ServiceUnavailableException(
      'واحد مبلغ سرویس پرواز هنوز تنظیم نشده است',
    );
  const total =
    num(price['adult_guest_price']) * search.adults +
    (search.children ? num(price['child_guest_price']) * search.children : 0) +
    (search.infants ? num(price['infant_guest_price']) * search.infants : 0);
  const amount = total / (currency === 'IRR' ? 10 : 1);
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new BadGatewayException('مبلغ پرواز قابل پرداخت نیست');
  return amount;
}
/**
 * The rules have been seen per route (`routes[].cancellation_rules`), but the
 * contract never fixed their field names, and a rule that is silently dropped
 * reads to the employee as «جریمه اعلام نشده». So: accept the rules on the
 * route or on the flight, the known spellings of text/percent, and plain
 * strings — and log any rule that still cannot be read, so the real shape
 * shows up in the API log instead of vanishing.
 */
const RULE_TEXT = ['timeframe_description', 'description', 'title', 'text', 'timeframe', 'name'];
const RULE_PERCENT = ['penalty_percent', 'percent', 'percentage', 'penalty', 'value'];
const ruleLogger = new Logger('FlightCancellationRules');
function cancellationRule(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
  const rule = raw as Record<string, unknown>;
  const text = RULE_TEXT.map((k) => rule[k]).find(
    (v): v is string => typeof v === 'string' && !!v.trim(),
  );
  const percent = RULE_PERCENT.map((k) => rule[k])
    .map((v) => (typeof v === 'string' && v.trim() ? Number(v) : v))
    .find((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (text && percent !== undefined)
    return `${text.trim()} — ${new Intl.NumberFormat('fa-IR').format(percent)}٪ جریمه`;
  return text?.trim() ?? '';
}
function cancellationRules(
  flight: Record<string, unknown>,
  routes: Record<string, unknown>[],
): string[] {
  const raw = [flight, ...routes].flatMap((r) =>
    Array.isArray(r['cancellation_rules']) ? r['cancellation_rules'] : [],
  );
  const rules = raw.map(cancellationRule);
  const unread = raw.filter((_, i) => !rules[i]);
  if (unread.length)
    ruleLogger.warn(
      `unreadable cancellation rule: ${JSON.stringify(unread[0]).slice(0, 500)}`,
    );
  return [...new Set(rules.filter(Boolean))];
}
function leg(raw: unknown): FlightLeg {
  const f = record(raw);
  const routes = list(f['routes']).map(record);
  const first = routes[0];
  if (!first || typeof f['is_foreign'] !== 'boolean')
    throw new BadGatewayException('جزئیات پرواز ناقص است');
  return {
    key: str(f['flight_key']),
    origin: str(f['origin']),
    destination: str(f['destination']),
    departureTime: str(f['departure_time']),
    arrivalTime: str(f['arrival_time']),
    airline: str(first['airline']),
    flightNumber: str(first['flight_number']),
    flightClass: str(first['flight_class']),
    flightType: str(first['flight_type']),
    baggage: num(f['baggage']),
    stops: num(f['stops']),
    capacity: num(f['capacity']),
    foreign: f['is_foreign'],
    rateClass: optionalStr(first['rate_class']),
    cancellationRules: cancellationRules(f, routes),
  };
}
export function mapFlightOffers(
  raw: unknown,
  search: FlightSearchInput,
  currency: string,
): FlightOffer[] {
  return list(raw)
    .map((item) => {
      const f = record(item);
      const departure = leg(f['departure_flight']);
      const returning = f['return_flight'] ? leg(f['return_flight']) : null;
      return {
        id: JSON.stringify([departure.key, returning?.key ?? null]),
        departure,
        returning,
        amount: flightAmount(record(f['total_price']), search, currency),
      };
    })
    .filter(
      (f) =>
        f.departure.origin === search.origin &&
        f.departure.destination === search.destination &&
        f.departure.departureTime.slice(0, 10) === search.departureDate &&
        f.departure.capacity >= search.adults + search.children &&
        (search.returnDate
          ? !!f.returning &&
            f.returning.origin === search.destination &&
            f.returning.destination === search.origin &&
            f.returning.departureTime.slice(0, 10) === search.returnDate &&
            f.returning.capacity >= search.adults + search.children
          : !f.returning),
    );
}
const RULES_TTL = 6 * 60 * 60_000;

/**
 * تأمین‌کننده برای بعضی ایرلاین‌ها چند ردیفِ هم‌پوشان یا متناقض می‌فرستد
 * (مثلاً ایران‌ایر S هم «۳۰٪ تا ۲۴ ساعت قبل» دارد هم «۳۰٪ تا ظهر ۳ روز قبل») و
 * هیچ فیلدی آن‌ها را از هم جدا نمی‌کند. تفسیر نمی‌کنیم: فقط تکراری‌های دقیق
 * حذف و از زودترین بازه به دیرترین مرتب می‌شوند تا کارمند همهٔ آن‌چه
 * تأمین‌کننده گفته را ببیند.
 */
export function formatCancellationRules(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const hoursBefore = (day: unknown, hour: unknown): number =>
    typeof hour === 'number'
      ? hour
      : typeof day === 'number'
        ? day * 24
        : Number.POSITIVE_INFINITY; // «از زمان صدور بلیط»
  const rows = raw
    .filter(
      (r): r is Record<string, unknown> =>
        !!r &&
        typeof r === 'object' &&
        typeof r['timeframe_description'] === 'string' &&
        typeof r['penalty_percent'] === 'number',
    )
    .map((r) => ({
      text: `${(r['timeframe_description'] as string).trim()} — ${new Intl.NumberFormat('fa-IR').format(r['penalty_percent'] as number)}٪ جریمه`,
      start: hoursBefore(r['from_day_count'], r['from_hour_count']),
      percent: r['penalty_percent'] as number,
    }))
    .sort(
      (a, b) =>
        (a.start === b.start ? 0 : a.start > b.start ? -1 : 1) ||
        a.percent - b.percent,
    );
  return [...new Set(rows.map((r) => r.text))];
}

export interface ProviderReservation {
  confirmationCode: string;
  status: string;
  totalAmount?: number;
  tickets: FlightTicket[];
  passengers?: FlightPassenger[];
}

/** The supplier returned a definitive rejection, so no reservation was created. */
export class FlightProviderRejectedException extends BadGatewayException {
  constructor() {
    super('سرویس پرواز درخواست رزرو را نپذیرفت');
  }
}

@Injectable()
export class FlightProvider {
  private readonly logger = new Logger(FlightProvider.name);

  /**
   * اقامت۲۴ برای هتل و پرواز یک Client-Token می‌دهد، پس همان `GRS_CLIENT_TOKEN`
   * هتل خوانده می‌شود. متغیر جدای پرواز عمداً حذف شد: مقدار کهنهٔ آن روی
   * سرور جا مانده بود و پرواز با `client_not_set` رد می‌شد در حالی که هتل کار
   * می‌کرد.
   */
  private clientToken(): string {
    return process.env.GRS_CLIENT_TOKEN_BASE64
      ? Buffer.from(process.env.GRS_CLIENT_TOKEN_BASE64, 'base64').toString(
          'utf8',
        )
      : (process.env.GRS_CLIENT_TOKEN ?? '');
  }
  assertConfigured(): void {
    if (
      process.env.FLIGHT_MODE !== 'live' ||
      !this.clientToken() ||
      !['IRR', 'IRT'].includes(process.env.FLIGHT_CURRENCY ?? '')
    ) {
      throw new ServiceUnavailableException(
        'سرویس پرواز هنوز فعال نشده است؛ لطفاً بعداً مراجعه کنید',
      );
    }
  }
  private async request(
    path: string,
    body?: unknown,
    allowEmptyValue = false,
  ): Promise<Record<string, unknown>> {
    this.assertConfigured();
    const base =
      // آدرس محیط اصلی طبق مستند پرواز (Host Url)
      process.env.FLIGHT_URL || 'https://gateway.grschannel.com/flight';
    const url = new URL(`${base.replace(/\/$/, '')}${path}`);
    if (url.protocol !== 'https:')
      throw new ServiceUnavailableException('آدرس سرویس پرواز باید امن باشد');
    let response: Response;
    try {
      response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Client-Token': this.clientToken(),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      // A transport failure is ambiguous for writes: the supplier may have processed it.
      throw new BadGatewayException(
        'ارتباط با سرویس پرواز ناموفق بود؛ وضعیت رزرو را پیگیری کنید',
      );
    }
    let envelope: Record<string, unknown>;
    try {
      envelope = record(await response.json());
    } catch {
      throw new BadGatewayException('پاسخ نامعتبر سرویس پرواز');
    }
    const hasErrors =
      (envelope['errors'] != null &&
        (!Array.isArray(envelope['errors']) ||
          envelope['errors'].length > 0)) ||
      (envelope['error'] != null &&
        (!Array.isArray(envelope['error']) || envelope['error'].length > 0));
    const failed =
      (response.status >= 400 && response.status < 500) ||
      (response.ok && (envelope['code'] !== 200 || hasErrors));
    if (failed || !response.ok) {
      // پیام و fingerprint تأمین‌کننده تنها سرنخِ علت است (آدرس اشتباه → 404،
      // توکنِ ثبت‌نشده → 403 `client_not_set`)؛ بدون این لاگ همه‌چیز یک خطای کلی بود.
      this.logger.error(
        `${body ? 'POST' : 'GET'} ${url.pathname} → HTTP ${response.status}, code ${String(
          envelope['code'],
        )}: ${String(envelope['message'] ?? '')} ${JSON.stringify(
          envelope['errors'] ?? envelope['error'] ?? null,
        )} fingerprint=${String(envelope['fingerprint'] ?? '-')}`,
      );
    }
    if (failed) {
      // فقط برای درخواستِ نوشتنی (رزرو) «رد قطعی» معنا دارد؛ خطای خواندن
      // (فرودگاه‌ها، جست‌وجو) را «رزرو را نپذیرفت» گزارش کردن گمراه‌کننده بود.
      if (body) throw new FlightProviderRejectedException();
      throw new ServiceUnavailableException(
        'سرویس پرواز فعلاً پاسخ نمی‌دهد؛ کمی بعد دوباره تلاش کنید',
      );
    }
    if (!response.ok)
      throw new BadGatewayException(
        'ارتباط با سرویس پرواز ناموفق بود؛ وضعیت رزرو را پیگیری کنید',
      );
    if (allowEmptyValue && envelope['value'] == null) return {};
    return record(envelope['value']);
  }
  async airports(): Promise<FlightAirport[]> {
    const result = await this.request('/api/v1/airports');
    return list(result['airports'])
      .map(record)
      .map((a) => ({ iata: str(a['iata']), name: str(a['name']) }));
  }
  /**
   * جست‌وجو `cancellation_rules` را همیشه خالی می‌فرستد (۲۰ از ۲۰ پرواز،
   * اندازه‌گیری‌شده)؛ قوانین واقعی از اندپوینت جدا با شناسهٔ عددی ایرلاین +
   * rate_class می‌آید. خطا رزرو را متوقف نمی‌کند — بدون قانون، اپ پیام
   * «اعلام نشده» را نشان می‌دهد.
   */
  async cancellationRules(airline: string, rateClass: string): Promise<string[]> {
    const key = `${airline}/${rateClass}`;
    const cached = this.rulesCache.get(key);
    if (cached && cached.until > Date.now()) return cached.rules;
    try {
      const airlineId = (await this.airlineIds()).get(airline);
      if (airlineId === undefined) return [];
      const query = new URLSearchParams({
        airline_id: String(airlineId),
        rate_class: rateClass,
      });
      const result = await this.request(
        `/api/v1/cancellation-rules/get-all-by-airline-id-and-rate-class?${query}`,
      );
      const rules = formatCancellationRules(result['cancellation_rules']);
      this.rulesCache.set(key, { rules, until: Date.now() + RULES_TTL });
      return rules;
    } catch (error) {
      this.logger.warn(
        `cancellation rules ${key} unavailable: ${(error as Error).message}`,
      );
      return [];
    }
  }
  private readonly rulesCache = new Map<
    string,
    { rules: string[]; until: number }
  >();
  private airlineCache?: { ids: Map<string, number>; until: number };
  private async airlineIds(): Promise<Map<string, number>> {
    if (this.airlineCache && this.airlineCache.until > Date.now())
      return this.airlineCache.ids;
    const result = await this.request('/api/v1/airlines');
    const ids = new Map<string, number>();
    for (const a of list(result['airlines']).map(record)) {
      const iata = optionalStr(a['iata']);
      if (iata && typeof a['id'] === 'number') ids.set(iata, a['id']);
    }
    this.airlineCache = { ids, until: Date.now() + RULES_TTL };
    return ids;
  }
  async search(input: FlightSearchInput): Promise<FlightOffer[]> {
    const query = new URLSearchParams({
      origin: input.origin,
      destination: input.destination,
      departure_date: input.departureDate,
      adult_count: String(input.adults),
      child_count: String(input.children),
      infant_count: String(input.infants),
      ...(input.returnDate ? { return_date: input.returnDate } : {}),
    });
    const result = await this.request(
      `/api/v2/flights/search?${query}`,
      undefined,
      true,
    );
    if (!('flights' in result)) return [];
    return mapFlightOffers(
      result['flights'],
      input,
      process.env.FLIGHT_CURRENCY ?? '',
    );
  }
  async create(
    offer: FlightOffer,
    input: FlightBookingInput,
  ): Promise<ProviderReservation> {
    const route = (f: FlightLeg) => ({
      flight_at: f.departureTime,
      origin_iata_code: f.origin,
      destination_iata_code: f.destination,
    });
    return this.reservation(
      await this.request('/api/v2/reserves/create', {
        booker_first_name: input.bookerFirstName,
        booker_last_name: input.bookerLastName,
        booker_mobile: input.mobile,
        notification_mobile: input.mobile,
        flight_keys: [
          offer.departure.key,
          ...(offer.returning ? [offer.returning.key] : []),
        ],
        departure_flight: route(offer.departure),
        ...(offer.returning ? { returned_flight: route(offer.returning) } : {}),
        passengers: input.passengers.map((p) => ({
          first_name_en: p.firstName,
          last_name_en: p.lastName,
          gender: p.gender,
          type: p.type,
          birthdate: p.birthdate,
          nationality: p.nationality,
          ...(p.nationalCode ? { national_code: p.nationalCode } : {}),
          ...(p.passportNumber
            ? {
                passport_number: p.passportNumber,
                passport_expiration_date: p.passportExpirationDate,
                passport_issue_country: p.passportIssueCountry,
              }
            : {}),
        })),
      }),
    );
  }
  async book(code: string): Promise<ProviderReservation> {
    return this.reservation(
      await this.request('/api/v2/reserves/book', { confirmation_code: code }),
    );
  }
  async inquiry(code: string): Promise<ProviderReservation> {
    const result = this.reservation(
      await this.request(
        `/api/v2/reserves/${encodeURIComponent(code)}/inquiry`,
      ),
    );
    if (result.confirmationCode !== code)
      throw new BadGatewayException('شناسه رزرو با پاسخ سرویس مطابقت ندارد');
    return result;
  }
  private reservation(value: Record<string, unknown>): ProviderReservation {
    const r = record(value['reserve']);
    const passengers = Array.isArray(r['passengers'])
      ? r['passengers'].map(record)
      : [];
    const tickets = Array.isArray(r['tickets'])
      ? r['tickets'].map(record).map((t) => {
          const passenger = passengers.find(
            (p) => p['id'] === t['passenger_id'],
          );
          return {
            id: num(t['id']),
            number: str(t['ticket_number']),
            pnr: str(t['pnr_code']),
            direction: str(t['route_direction']),
            passengerName: passenger
              ? `${str(passenger['first_name_en'])} ${str(passenger['last_name_en'])}`
              : '',
          };
        })
      : [];
    return {
      confirmationCode: str(r['confirmation_code']),
      status: str(r['status']),
      tickets,
      passengers: passengers.flatMap((p) => {
        const firstName = optionalStr(p['first_name_en']);
        const lastName = optionalStr(p['last_name_en']);
        const birthdate = optionalStr(p['birthdate']);
        const nationality = optionalStr(p['nationality']);
        const gender = optionalStr(p['gender']);
        const type = optionalStr(p['type']);
        if (!firstName || !lastName || !birthdate || !nationality || !gender)
          return [];
        const nationalCode = optionalStr(p['national_code']);
        const passportNumber = optionalStr(p['passport_number']);
        const passportExpirationDate = optionalStr(
          p['passport_expiration_date'],
        );
        const passportIssueCountry = optionalStr(p['passport_issue_country']);
        return [
          {
            firstName,
            lastName,
            gender:
              gender === 'female' ? ('female' as const) : ('male' as const),
            type:
              type === 'child'
                ? ('child' as const)
                : type === 'infant'
                  ? ('infant' as const)
                  : ('adult' as const),
            birthdate,
            nationality,
            ...(nationalCode ? { nationalCode } : {}),
            ...(passportNumber ? { passportNumber } : {}),
            ...(passportExpirationDate ? { passportExpirationDate } : {}),
            ...(passportIssueCountry ? { passportIssueCountry } : {}),
          },
        ];
      }),
      ...(typeof r['total_guest_price'] === 'number' &&
      r['total_guest_price'] > 0
        ? {
            totalAmount: flightAmount(
              { adult_guest_price: r['total_guest_price'] },
              { adults: 1, children: 0, infants: 0 } as FlightSearchInput,
              process.env.FLIGHT_CURRENCY ?? '',
            ),
          }
        : {}),
    };
  }
}
