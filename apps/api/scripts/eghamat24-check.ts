/** Read-only smoke check against the configured hotel/flight environments. */
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { GrsHttpClient } from '../src/app/tourism/providers/eghamat24/grs-http.client';
import { Eghamat24Provider } from '../src/app/tourism/providers/eghamat24/eghamat24.provider';
import { FlightProvider } from '../src/app/tourism/flights/flight-provider';

async function main() {
  const fetchOriginal = globalThis.fetch;
  // پاسخ خامِ جست‌وجوی پرواز، برای دیدنِ اینکه چارتر/سیستمی در کدام فیلد می‌آید
  let rawFlightSearch: unknown;
  globalThis.fetch = (async (input: URL, init: RequestInit) => {
    assert.equal(init.method, 'GET', 'Smoke check must never book or pay');
    const headers = new Headers(init.headers);
    assert.ok(headers.get('Client-Token'));
    assert.equal(headers.has('Auth-Token'), false);
    assert.equal(headers.has('Authorization'), false);
    const response = await fetchOriginal(input, init);
    if (String(input).includes('/flights/search')) {
      rawFlightSearch = await response
        .clone()
        .json()
        .catch(() => null);
    }
    return response;
  }) as typeof fetch;
  try {
    const hotels = new Eghamat24Provider(new GrsHttpClient());
    const flights = new FlightProvider();
    const cities = await hotels.cities();
    const mashhad = cities.find((c) => c.name.includes('مشهد'));
    assert.ok(mashhad, 'Mashhad must be available beyond catalog pagination');
    const catalog = await hotels.hotels(mashhad.id);
    assert.ok(catalog.length > 0);
    const detail = await hotels.hotel(catalog[0].id);
    assert.ok(detail?.name);
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);
    const rooms = await hotels.search({
      cityId: mashhad.id,
      hotelId: null,
      checkin: date,
      nights: 1,
      capacity: 1,
      rate: 0,
    });
    const airports = await flights.airports();
    assert.ok(airports.some((a) => a.iata === 'THR'));
    const offers = await flights.search({
      origin: 'THR',
      destination: 'MHD',
      departureDate: date,
      adults: 1,
      children: 0,
      infants: 0,
    });
    assert.ok(
      offers.every(
        (offer) => Number.isSafeInteger(offer.amount) && offer.amount > 0,
      ),
    );
    console.log(
      JSON.stringify(
        {
          cities: cities.length,
          mashhadHotels: catalog.length,
          firstHotel: detail.name,
          availableHotels: rooms.length,
          // کارت فهرست تاریخ‌دار از همین فیلدها ساخته می‌شود — باید پر باشند
          availabilitySample: rooms.slice(0, 3).map((hotel) => ({
            hotelName: hotel.hotelName,
            rate: hotel.rate,
            address: hotel.address,
            photo: hotel.photo,
            rooms: hotel.rooms.length,
            fromPrice: Math.min(...hotel.rooms.map((room) => room.price)),
          })),
          airports: airports.length,
          flights: offers.length,
          date,
          authentication: 'Client-Token only',
          currency: process.env.FLIGHT_CURRENCY,
          flightTypes: flightTypeSummary(rawFlightSearch),
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}
/**
 * مقدارهای `flight_type` (روی پرواز و روی هر route) با تعدادشان، به‌علاوهٔ یک
 * نمونهٔ خام بدون قوانین کنسلی — تا معلوم شود تأمین‌کننده سیستمی را کجا و
 * با چه مقداری می‌فرستد.
 */
function flightTypeSummary(raw: unknown) {
  const value = (raw as { value?: { flights?: unknown[] } } | null)?.value;
  const flights = (value?.flights ?? []) as Record<string, unknown>[];
  const counts: Record<string, number> = {};
  const count = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
  for (const offer of flights) {
    for (const legKey of ['departure_flight', 'return_flight']) {
      const leg = offer[legKey] as Record<string, unknown> | null;
      if (!leg) continue;
      count(`flight.flight_type=${JSON.stringify(leg['flight_type'])}`);
      for (const route of (leg['routes'] ?? []) as Record<string, unknown>[]) {
        count(`route.flight_type=${JSON.stringify(route['flight_type'])}`);
      }
    }
  }
  const sample = flights[0]
    ? JSON.parse(
        JSON.stringify(flights[0], (key, v) =>
          key === 'cancellation_rules' ? undefined : v,
        ),
      )
    : null;
  return { counts, sample };
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Connection check failed',
  );
  process.exitCode = 1;
});
