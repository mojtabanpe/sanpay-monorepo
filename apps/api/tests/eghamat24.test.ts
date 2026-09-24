import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GrsHttpClient } from '../src/app/tourism/providers/eghamat24/grs-http.client';
import { Eghamat24Provider } from '../src/app/tourism/providers/eghamat24/eghamat24.provider';
import { FlightProvider } from '../src/app/tourism/flights/flight-provider';

const day = (date: string, rate = 21500000) => ({
  day: date,
  inventory: 5,
  grs_rate: rate,
  rack_rate: 30000000,
  closed: false,
});
const room = {
  room_type_id: 42,
  room_type_name: 'دوتخته',
  room_type_capacity: 2,
  rate_plans: [
    {
      id: 7,
      sleeps: null,
      meal_type_included: null,
      board_type: 'full_board',
      prices: [day('2090-01-01'), day('2090-01-02')],
    },
  ],
};
const detail = {
  id: 1416,
  name: 'تست',
  star: '4',
  city_id: 37,
  rooms_count: 2,
  room_types: [{ id: 42, capacity: 2 }],
};
const params = {
  cityId: 'eg:37',
  hotelId: null,
  checkin: '2090-01-01',
  nights: 1,
  capacity: 2,
  rate: 0,
};

async function fixture(
  run: (client: GrsHttpClient, requests: URL[]) => Promise<void>,
  respond: (url: URL) => unknown,
) {
  const original = globalThis.fetch;
  const env = { ...process.env };
  const requests: URL[] = [];
  delete process.env.GRS_CLIENT_TOKEN_BASE64;
  delete process.env.FLIGHT_CLIENT_TOKEN_BASE64;
  process.env.GRS_CLIENT_TOKEN = 'https://example.invalid/-$opaque-client';
  process.env.GRS_URL = 'https://example.invalid';
  process.env.FLIGHT_CLIENT_TOKEN = process.env.GRS_CLIENT_TOKEN;
  process.env.FLIGHT_URL = 'https://example.invalid/flight';
  process.env.FLIGHT_MODE = 'live';
  process.env.FLIGHT_CURRENCY = 'IRR';
  globalThis.fetch = (async (input: URL, init: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url);
    const headers = new Headers(init.headers);
    assert.equal(
      headers.get('Client-Token'),
      'https://example.invalid/-$opaque-client',
    );
    assert.equal(headers.has('Auth-Token'), false);
    assert.equal(headers.has('Authorization'), false);
    assert.equal(init.redirect, 'error');
    return new Response(JSON.stringify(respond(url)), { status: 200 });
  }) as typeof fetch;
  try {
    await run(new GrsHttpClient(), requests);
  } finally {
    globalThis.fetch = original;
    for (const key of [
      'GRS_CLIENT_TOKEN_BASE64',
      'FLIGHT_CLIENT_TOKEN_BASE64',
      'GRS_CLIENT_TOKEN',
      'GRS_URL',
      'FLIGHT_CLIENT_TOKEN',
      'FLIGHT_URL',
      'FLIGHT_MODE',
      'FLIGHT_CURRENCY',
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
}
const ok = (value: unknown) => ({ code: 200, errors: null, value });

test('catalog follows total and actual page length, preserving opaque token and city filter', async () => {
  await fixture(
    async (client, requests) => {
      const hotels = await client.getProperties(37);
      assert.deepEqual(
        hotels.map((p) => p.id),
        [1, 2, 3],
      );
      assert.equal(hotels[0].star, 4);
      assert.equal(hotels[0].room_count, 2);
      assert.deepEqual(
        requests.map((u) => u.searchParams.get('page')),
        ['1', '2'],
      );
      assert.ok(
        requests.every((u) => u.searchParams.get('filters[0][value]') === '37'),
      );
    },
    (url) =>
      ok({
        total: 3,
        properties: (url.searchParams.get('page') === '1' ? [1, 2] : [3]).map(
          (id) => ({ ...detail, id }),
        ),
      }),
  );
});

test('cities beyond first page are retained and repeated pages fail instead of looping', async () => {
  await fixture(
    async (client) => {
      assert.equal((await client.getCities()).length, 2);
    },
    (url) =>
      ok({
        total: 2,
        cities: [{ id: Number(url.searchParams.get('page')), name: 'شهر' }],
      }),
  );
  await fixture(
    async (client, requests) => {
      await assert.rejects(client.getCities(), /صفحه‌بندی/);
      assert.equal(requests.length, 2);
    },
    () => ok({ total: 2, cities: [{ id: 1 }] }),
  );
});

test('live hotel search maps nested plans, capacity and meals, excluding checkout charges', async () => {
  await fixture(
    async (client) => {
      const provider = new Eghamat24Provider(client);
      for (const hotelId of [null, 'eg:1416']) {
        const result = await provider.search({ ...params, hotelId });
        assert.equal(result[0].rooms[0].price, 2150000);
        assert.equal(result[0].rooms[0].capacity, 2);
        assert.equal(result[0].rooms[0].breakfast, true);
        assert.equal(result[0].rooms[0].roomId, 'eg:1416:42:7');
      }
      assert.deepEqual(await provider.search({ ...params, capacity: 3 }), []);
    },
    (url) =>
      url.pathname.includes('available-rooms')
        ? ok({ rooms: [room] })
        : url.pathname.includes('suggestion')
          ? ok({
              suggestions: [
                { property_id: 1416, property_name: 'تست', rooms: [room] },
              ],
              total: 1,
            })
          : ok({ property: detail }),
  );
});

test('missing or duplicate night rates cannot be sold', async () => {
  for (const prices of [
    [day('2090-01-02')],
    [day('2090-01-01'), day('2090-01-01')],
  ]) {
    await fixture(
      async (client) => {
        assert.deepEqual(
          await new Eghamat24Provider(client).search(params),
          [],
        );
      },
      () =>
        ok({
          total: 1,
          suggestions: [
            {
              property_id: 1416,
              rooms: [
                { ...room, rate_plans: [{ ...room.rate_plans[0], prices }] },
              ],
            },
          ],
        }),
    );
  }
});

test('HTTP 200 protocol errors are rejected without exposing provider messages or retrying', async () => {
  for (const field of ['errors', 'error']) {
    await fixture(
      async (client, requests) => {
        await assert.rejects(
          client.book('test-only'),
          (e: Error) => !e.message.includes('secret-provider-message'),
        );
        assert.equal(requests.length, 1);
        await assert.rejects(new FlightProvider().airports());
      },
      () => ({
        code: 200,
        [field]: [{ message: 'secret-provider-message' }],
        value: { reserve: {} },
      }),
    );
  }
});

test('flight API reads and converts IRR using Client-Token alone', async () => {
  await fixture(
    async (_client, requests) => {
      const provider = new FlightProvider();
      assert.deepEqual(await provider.airports(), [
        { iata: 'THR', name: 'تهران' },
      ]);
      const flights = await provider.search({
        origin: 'THR',
        destination: 'MHD',
        departureDate: '2090-01-01',
        adults: 1,
        children: 0,
        infants: 0,
      });
      assert.equal(flights[0].amount, 2000);
      assert.equal(requests[1].pathname, '/flight/api/v2/flights/search');
    },
    (url) =>
      url.pathname.endsWith('airports')
        ? ok({ airports: [{ iata: 'THR', name: 'تهران' }] })
        : ok({
            flights: [
              {
                departure_flight: {
                  flight_key: 'key',
                  origin: 'THR',
                  destination: 'MHD',
                  departure_time: '2090-01-01 18:00:00',
                  arrival_time: '2090-01-01 20:00:00',
                  is_foreign: false,
                  baggage: 20,
                  stops: 0,
                  capacity: 5,
                  routes: [
                    {
                      airline: 'IR',
                      flight_number: '123',
                      flight_class: 'economy',
                      flight_type: 'charter',
                      cancellation_rules: [],
                    },
                  ],
                },
                return_flight: null,
                total_price: { adult_guest_price: 20000 },
              },
            ],
          }),
  );
});

test('Base64 configuration preserves dollar signs even if Nx expands the plain variable', async () => {
  await fixture(
    async (client) => {
      const encoded = Buffer.from(
        'https://example.invalid/-$opaque-client',
      ).toString('base64');
      process.env.GRS_CLIENT_TOKEN_BASE64 = encoded;
      process.env.FLIGHT_CLIENT_TOKEN_BASE64 = encoded;
      process.env.GRS_CLIENT_TOKEN = 'expanded-incorrectly';
      process.env.FLIGHT_CLIENT_TOKEN = 'expanded-incorrectly';
      assert.deepEqual(await client.getCities(), []);
      assert.deepEqual(await new FlightProvider().airports(), []);
    },
    () => ok({ cities: [], airports: [], total: 0 }),
  );
});
