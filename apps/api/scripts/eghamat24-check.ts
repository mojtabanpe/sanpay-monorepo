/** Read-only smoke check against the configured hotel/flight environments. */
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { GrsHttpClient } from '../src/app/tourism/providers/eghamat24/grs-http.client';
import { Eghamat24Provider } from '../src/app/tourism/providers/eghamat24/eghamat24.provider';
import { FlightProvider } from '../src/app/tourism/flights/flight-provider';

async function main() {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (input: URL, init: RequestInit) => {
    assert.equal(init.method, 'GET', 'Smoke check must never book or pay');
    const headers = new Headers(init.headers);
    assert.ok(headers.get('Client-Token'));
    assert.equal(headers.has('Auth-Token'), false);
    assert.equal(headers.has('Authorization'), false);
    return fetchOriginal(input, init);
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
          airports: airports.length,
          flights: offers.length,
          date,
          authentication: 'Client-Token only',
          currency: process.env.FLIGHT_CURRENCY,
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = fetchOriginal;
  }
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Connection check failed',
  );
  process.exitCode = 1;
});
