import {
  BadGatewayException,
  Injectable,
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
    cancellationRules: routes
      .flatMap((r) =>
        list(r['cancellation_rules'])
          .map(record)
          .map((rule) =>
            typeof rule['timeframe_description'] === 'string'
              ? `${rule['timeframe_description']} — ${num(rule['penalty_percent'])}٪`
              : '',
          ),
      )
      .filter(Boolean),
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
  private clientToken(): string {
    return process.env.FLIGHT_CLIENT_TOKEN_BASE64
      ? Buffer.from(process.env.FLIGHT_CLIENT_TOKEN_BASE64, 'base64').toString(
          'utf8',
        )
      : (process.env.FLIGHT_CLIENT_TOKEN ?? '');
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
    if (
      (response.status >= 400 && response.status < 500) ||
      (response.ok && (envelope['code'] !== 200 || hasErrors))
    )
      throw new FlightProviderRejectedException();
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
