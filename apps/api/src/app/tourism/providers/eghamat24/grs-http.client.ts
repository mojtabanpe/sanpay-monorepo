import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GrsCity,
  GrsClient,
  GrsProperty,
  GrsPropertyDetails,
  GrsRatePlan,
  GrsReserveDetails,
  GrsReserveRequest,
  GrsRoomRate,
  GrsSuggestion,
  GrsSuggestionParams,
} from './grs.types';

type Row = Record<string, unknown>;
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadGatewayException('پاسخ نامعتبر سرویس اقامت۲۴');
  return value as Row;
}
function rows(value: unknown): Row[] {
  if (!Array.isArray(value))
    throw new BadGatewayException('فهرست نامعتبر سرویس اقامت۲۴');
  return value.map(row);
}
function property(value: unknown): GrsPropertyDetails {
  const p = row(value);
  return {
    ...p,
    star: Number(p['star']),
    room_count: p['rooms_count'],
    room_type: p['room_types'] ?? null,
  } as unknown as GrsPropertyDetails;
}

/** Server-to-server GRS API. The Client-Token is opaque, even when it looks like a URL. */
@Injectable()
export class GrsHttpClient extends GrsClient {
  private async request(path: string, body?: unknown): Promise<Row> {
    const token = process.env.GRS_CLIENT_TOKEN_BASE64
      ? Buffer.from(process.env.GRS_CLIENT_TOKEN_BASE64, 'base64').toString(
          'utf8',
        )
      : process.env.GRS_CLIENT_TOKEN;
    if (!token)
      throw new ServiceUnavailableException(
        'توکن سرویس اقامت۲۴ تنظیم نشده است',
      );
    const base = process.env.GRS_URL ?? 'https://hotel-test-01.denv.ir';
    const url = new URL(`${base.replace(/\/$/, '')}${path}`);
    if (url.protocol !== 'https:')
      throw new ServiceUnavailableException('آدرس سرویس اقامت۲۴ باید امن باشد');
    try {
      const response = await fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Client-Token': token,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const envelope = row(await response.json());
      if (
        !response.ok ||
        envelope['code'] !== 200 ||
        (envelope['errors'] != null &&
          (!Array.isArray(envelope['errors']) ||
            envelope['errors'].length > 0)) ||
        (envelope['error'] != null &&
          (!Array.isArray(envelope['error']) || envelope['error'].length > 0))
      )
        throw new Error('GRS request failed');
      return row(envelope['value']);
    } catch {
      // Provider messages can echo tokens or guest details. Never expose them or retry writes.
      throw new BadGatewayException('ارتباط با سرویس اقامت۲۴ ناموفق بود');
    }
  }

  private async catalog(
    path: string,
    key: string,
    query = new URLSearchParams(),
  ): Promise<Row[]> {
    const result: Row[] = [];
    const seen = new Set<unknown>();
    for (let page = 1; page <= 1000; page++) {
      query.set('count', '100');
      query.set('page', String(page));
      const value = await this.request(`${path}?${query}`);
      const batch = rows(value[key]);
      const total = value['total'];
      if (!Number.isSafeInteger(total) || Number(total) < 0)
        throw new BadGatewayException('تعداد نتایج اقامت۲۴ نامعتبر است');
      for (const item of batch) {
        const id = item['id'] ?? item['property_id'];
        if (id === undefined || seen.has(id))
          throw new BadGatewayException('صفحه‌بندی اقامت۲۴ نامعتبر است');
        seen.add(id);
      }
      result.push(...batch);
      if (result.length >= Number(total)) return result;
      if (!batch.length) break;
    }
    throw new BadGatewayException('فهرست اقامت۲۴ ناقص دریافت شد');
  }

  async getCities(): Promise<GrsCity[]> {
    return (await this.catalog('/v1/cities', 'cities')) as unknown as GrsCity[];
  }
  async getProperties(cityId: number | null): Promise<GrsProperty[]> {
    const query = new URLSearchParams();
    if (cityId !== null) {
      query.set('filters[0][name]', 'city_id');
      query.set('filters[0][operand]', 'IsEqualTo');
      query.set('filters[0][value]', String(cityId));
    }
    return (await this.catalog('/v1/properties', 'properties', query)).map(
      property,
    );
  }
  async getPropertyDetails(
    propertyId: number,
  ): Promise<GrsPropertyDetails | null> {
    const value = await this.request(`/v1/properties/${propertyId}`);
    return value['property'] == null ? null : property(value['property']);
  }
  private normalizeRooms(
    value: unknown,
    propertyId: number,
    capacities = new Map<number, number>(),
  ): GrsRoomRate[] {
    return rows(value).map((room) => ({
      property_id: propertyId,
      room_type_id: Number(room['room_type_id']),
      room_type_name: String(room['room_type_name'] ?? ''),
      rate_plans: rows(room['rate_plans'] ?? []).map(
        (plan) =>
          ({
            ...plan,
            meal_type_included:
              plan['meal_type_included'] ?? plan['board_type'] ?? null,
            sleeps:
              plan['sleeps'] ??
              room['room_type_capacity'] ??
              capacities.get(Number(room['room_type_id'])) ??
              0,
          }) as unknown as GrsRatePlan,
      ),
    }));
  }
  async getAvailableRooms(
    propertyId: number,
    checkIn: string,
    checkOut: string,
  ): Promise<GrsRoomRate[]> {
    const query = new URLSearchParams({
      property_id: String(propertyId),
      check_in: checkIn,
      check_out: checkOut,
    });
    const [value, detail] = await Promise.all([
      this.request(`/v1/available-rooms?${query}`),
      this.getPropertyDetails(propertyId),
    ]);
    return this.normalizeRooms(
      value['rooms'],
      propertyId,
      new Map((detail?.room_type ?? []).map((r) => [r.id, r.capacity])),
    );
  }
  async suggestion(params: GrsSuggestionParams): Promise<GrsSuggestion[]> {
    const query = new URLSearchParams({
      check_in: params.checkIn,
      check_out: params.checkOut,
      adults_count: String(params.adultsCount),
    });
    if (params.cityId !== null) query.set('city_id', String(params.cityId));
    if (params.propertyId !== null)
      query.set('property_id', String(params.propertyId));
    const [suggestions, properties] = await Promise.all([
      this.catalog('/v1/suggestion', 'suggestions', query),
      params.star > 0
        ? this.getProperties(params.cityId)
        : Promise.resolve(null),
    ]);
    const allowed =
      properties &&
      new Set(properties.filter((p) => p.star >= params.star).map((p) => p.id));
    return suggestions
      .filter((s) => !allowed || allowed.has(Number(s['property_id'])))
      .map((s) => ({
        property_id: Number(s['property_id']),
        property_name: String(s['property_name'] ?? ''),
        rooms: null,
        room_rates: this.normalizeRooms(s['rooms'], Number(s['property_id'])),
      }));
  }
  private async reservation(
    path: string,
    body?: unknown,
  ): Promise<GrsReserveDetails> {
    const value = await this.request(path, body);
    const reserve = row(value['reserve']);
    if (
      typeof reserve['confirmation_code'] !== 'string' ||
      typeof reserve['status'] !== 'string'
    )
      throw new BadGatewayException('پاسخ رزرو اقامت۲۴ نامعتبر است');
    return reserve as unknown as GrsReserveDetails;
  }
  reserve(request: GrsReserveRequest) {
    return this.reservation('/v1/reserve', request);
  }
  book(confirmationCode: string) {
    return this.reservation('/v1/book', {
      confirmation_code: confirmationCode,
    });
  }
  reserveDetails(confirmationCode: string) {
    return this.reservation(
      `/v1/reserve-details?${new URLSearchParams({ confirmation_code: confirmationCode })}`,
    );
  }
  cancel(confirmationCode: string) {
    return this.reservation('/v1/cancel', {
      confirmation_code: confirmationCode,
    });
  }
  acceptCancel(confirmationCode: string) {
    return this.reservation(
      `/v1/accept-cancel/${encodeURIComponent(confirmationCode)}`,
      {},
    );
  }
  rejectCancel(confirmationCode: string) {
    return this.reservation(
      `/v1/reject-cancel/${encodeURIComponent(confirmationCode)}`,
      {},
    );
  }
}
