import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  FlightBookingInput,
  FlightOffer,
  FlightSearchInput,
} from '@sanpay/models';
import {
  flightAmount,
  FlightProvider,
  FlightProviderRejectedException,
  mapFlightOffers,
} from '../src/app/tourism/flights/flight-provider';
import {
  FlightsService,
  isValidIranianNationalCode,
  validateFlightPassengers,
  validateFlightSearch,
} from '../src/app/tourism/flights/flights.service';
import {
  BookFlightDto,
  SearchFlightsDto,
} from '../src/app/tourism/flights/flights.dto';
import { PrismaService } from '../src/app/prisma/prisma.service';

const search: FlightSearchInput = {
  origin: 'THR',
  destination: 'MHD',
  departureDate: '2090-01-01',
  adults: 1,
  children: 0,
  infants: 0,
};
const leg = {
  flight_key: 'flight-key',
  origin: 'THR',
  destination: 'MHD',
  departure_time: '2090-01-01 20:00:00',
  arrival_time: '2090-01-01 22:00:00',
  is_foreign: false,
  baggage: 20,
  stops: 0,
  capacity: 3,
  routes: [
    {
      airline: 'IR',
      flight_number: '123',
      flight_class: 'economy',
      flight_type: 'charter',
      cancellation_rules: [],
    },
  ],
};
const raw = [
  {
    departure_flight: leg,
    return_flight: null,
    total_price: {
      adult_guest_price: 10000,
      child_guest_price: 5000,
      infant_guest_price: 2000,
    },
  },
];
const offer = mapFlightOffers(raw, search, 'IRR')[0];
const input: FlightBookingInput = {
  quoteId: 'c177b991-0735-421b-a4e8-edff6e5d9a71',
  allocationId: '4f3e52b1-a2a0-4c72-9ec9-990fa5ba91ae',
  bookerFirstName: 'علی',
  bookerLastName: 'احمدی',
  mobile: '09121234567',
  passengers: [
    {
      firstName: 'Ali',
      lastName: 'Ahmadi',
      birthdate: '2070-01-01',
      nationality: 'IR',
      nationalCode: '0492578631',
      type: 'adult',
      gender: 'male',
    },
  ],
};

test('converts provider prices once and totals each passenger category', () => {
  assert.equal(offer.amount, 1000);
  assert.equal(
    flightAmount(
      raw[0].total_price,
      { ...search, adults: 2, children: 1, infants: 1 },
      'IRR',
    ),
    2700,
  );
  assert.equal(flightAmount(raw[0].total_price, search, 'IRT'), 10000);
  assert.throws(() => flightAmount(raw[0].total_price, search, ''));
  assert.throws(() =>
    flightAmount({ adult_guest_price: 10001 }, search, 'IRR'),
  );
  assert.throws(() => flightAmount({ adult_guest_price: -10 }, search, 'IRR'));
});
test('keeps paired return flights and rejects mismatched dates/routes or capacity', () => {
  assert.equal(mapFlightOffers(raw, { ...search, adults: 4 }, 'IRR').length, 0);
  assert.equal(
    mapFlightOffers(raw, { ...search, departureDate: '2090-01-02' }, 'IRR')
      .length,
    0,
  );
  const round = [
    {
      ...raw[0],
      return_flight: {
        ...leg,
        flight_key: 'return-key',
        origin: 'MHD',
        destination: 'THR',
        departure_time: '2090-01-03 20:00:00',
      },
    },
  ];
  assert.equal(
    mapFlightOffers(round, { ...search, returnDate: '2090-01-03' }, 'IRR')[0]
      .returning?.key,
    'return-key',
  );
  assert.equal(mapFlightOffers(round, search, 'IRR').length, 0);
});
test('validates dates, counts, passenger identities and passports', () => {
  assert.equal(isValidIranianNationalCode('0492578631'), true);
  assert.equal(isValidIranianNationalCode('3060123456'), false);
  assert.equal(isValidIranianNationalCode('1111111111'), false);
  assert.throws(() => validateFlightSearch({ ...search, origin: 'MHD' }));
  assert.throws(() =>
    validateFlightSearch({ ...search, departureDate: '2000-01-01' }),
  );
  assert.throws(() => validateFlightSearch({ ...search, infants: 2 }));
  assert.ok(
    validateSync(plainToInstance(SearchFlightsDto, { ...search, adults: 1.5 }))
      .length,
  );
  assert.ok(
    validateSync(
      plainToInstance(SearchFlightsDto, {
        ...search,
        departureDate: '2090-02-31',
      }),
    ).length,
  );
  assert.equal(validateSync(plainToInstance(BookFlightDto, input)).length, 0);
  validateFlightPassengers(input, search, offer);
  assert.throws(() =>
    validateFlightPassengers(
      { ...input, passengers: [input.passengers[0], input.passengers[0]] },
      { ...search, adults: 2 },
      offer,
    ),
  );
  assert.throws(() =>
    validateFlightPassengers(input, search, {
      ...offer,
      departure: { ...offer.departure, foreign: true },
    }),
  );
  assert.throws(() =>
    validateFlightPassengers(
      {
        ...input,
        passengers: [{ ...input.passengers[0], birthdate: '2089-01-01' }],
      },
      search,
      offer,
    ),
  );
  assert.throws(() =>
    validateFlightPassengers(
      {
        ...input,
        passengers: [{ ...input.passengers[0], nationalCode: '3060123456' }],
      },
      search,
      offer,
    ),
  );
});

function harness(
  options: {
    existing?: boolean;
    foreignOwner?: boolean;
    usableWallet?: boolean;
    concurrentDebit?: boolean;
    timeoutAt?: 'create' | 'book';
    rejectCreate?: boolean;
    status?: string;
    lockedAmount?: number;
  } = {},
) {
  let row: Record<string, unknown> | null = options.existing
    ? {
        id: 'booking',
        employeeId: options.foreignOwner ? 'other' : 'employee',
        status: 'CONFIRMED',
        amount: 1000n,
        confirmationCode: 'ABC',
        createdAt: new Date(),
      }
    : null;
  const counts = { create: 0, book: 0, debit: 0, transaction: 0, refunds: 0 };
  const quote = {
    id: input.quoteId,
    employeeId: 'employee',
    expiresAt: new Date(Date.now() + 60000),
    search,
    offer,
    amount: 1000n,
  };
  const db = {
    flightQuote: { findFirst: async () => quote },
    flightBooking: {
      findUnique: async () => row,
      findUniqueOrThrow: async () => row,
      findMany: async () => (row ? [row] : []),
      findFirst: async ({ where }: { where: { employeeId: string } }) =>
        row?.['employeeId'] === where.employeeId
          ? { ...row, quote, allocation: { definition: { name: 'گردشگری' } } }
          : null,
      create: async () => {
        row = {
          id: 'booking',
          employeeId: 'employee',
          status: 'PROCESSING',
          amount: 1000n,
          refunded: false,
          tickets: [],
          confirmationCode: null,
          createdAt: new Date(),
        };
        return row;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row ?? {}, data);
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (data['refunded'] && row?.['refunded']) return { count: 0 };
        Object.assign(row ?? {}, data);
        return { count: 1 };
      },
    },
    walletAllocation: {
      update: async () => {
        counts.refunds++;
      },
      findFirst: async () =>
        options.usableWallet === false
          ? null
          : {
              id: input.allocationId,
              cap: 2000n,
              spent: 0n,
              employee: { isActive: true },
            },
      updateMany: async () => {
        counts.debit++;
        return { count: options.concurrentDebit ? 0 : 1 };
      },
    },
    transaction: {
      create: async () => {
        counts.transaction++;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  const provider = {
    assertConfigured: () => undefined,
    search: async (): Promise<FlightOffer[]> => [offer],
    create: async () => {
      counts.create++;
      if (options.rejectCreate) throw new FlightProviderRejectedException();
      if (options.timeoutAt === 'create') throw new Error('timeout');
      return {
        confirmationCode: 'ABC',
        status: 'approved',
        totalAmount: options.lockedAmount ?? 1000,
        tickets: [],
      };
    },
    book: async () => {
      counts.book++;
      if (options.timeoutAt === 'book' && counts.book === 1)
        throw new Error('timeout');
      return {
        confirmationCode: 'ABC',
        status: options.status ?? 'booked',
        tickets: [],
      };
    },
    inquiry: async () => ({
      confirmationCode: 'ABC',
      status: 'approved',
      totalAmount: options.lockedAmount ?? 1000,
      tickets: [],
    }),
  };
  return {
    service: new FlightsService(
      db as unknown as PrismaService,
      provider as unknown as FlightProvider,
    ),
    counts,
  };
}
test('duplicate quote returns existing receipt without charging or calling provider', async () => {
  const h = harness({ existing: true });
  assert.equal((await h.service.book('employee', input)).status, 'CONFIRMED');
  assert.deepEqual(h.counts, {
    create: 0,
    book: 0,
    debit: 0,
    transaction: 0,
    refunds: 0,
  });
});
test('cannot access another employee reservation by guessing a quote', async () => {
  const h = harness({ existing: true, foreignOwner: true });
  await assert.rejects(h.service.book('employee', input));
  assert.equal(h.counts.create, 0);
});
test('invalid wallet fails before contacting reservation API', async () => {
  for (const options of [{ usableWallet: false }, { concurrentDebit: true }]) {
    const h = harness(options);
    await assert.rejects(h.service.book('employee', input));
    assert.equal(h.counts.create, 0);
    assert.equal(h.counts.transaction, 0);
  }
});
test('successful booking records one debit and runs create then book once', async () => {
  const h = harness();
  assert.equal((await h.service.book('employee', input)).status, 'CONFIRMED');
  assert.deepEqual(h.counts, {
    create: 1,
    book: 1,
    debit: 1,
    transaction: 1,
    refunds: 0,
  });
  await h.service.book('employee', input);
  assert.deepEqual(h.counts, {
    create: 1,
    book: 1,
    debit: 1,
    transaction: 1,
    refunds: 0,
  });
});
test('ambiguous provider outcomes retain a durable review record without retrying writes', async () => {
  for (const timeoutAt of ['create', 'book'] as const) {
    const h = harness({ timeoutAt });
    const receipt = await h.service.book('employee', input);
    assert.equal(receipt.status, 'REVIEW');
    assert.equal(h.counts.debit, 1);
    assert.equal(
      receipt.confirmationCode,
      timeoutAt === 'create' ? null : 'ABC',
    );
    await h.service.book('employee', input);
    assert.equal(h.counts.create, 1);
  }
  assert.equal(
    (await harness({ status: 'booking' }).service.book('employee', input))
      .status,
    'PROCESSING',
  );
  assert.equal(
    (await harness({ status: 'unknown' }).service.book('employee', input))
      .status,
    'REVIEW',
  );
});

test('definitive create rejection fails and refunds immediately', async () => {
  const h = harness({ rejectCreate: true });
  const receipt = await h.service.book('employee', input);
  assert.equal(receipt.status, 'REJECTED');
  assert.equal(receipt.refunded, true);
  assert.equal(h.counts.refunds, 1);
});

test('reconciliation completes an approved reservation even after the original book timed out', async () => {
  const previousMode = process.env.FLIGHT_MODE;
  process.env.FLIGHT_MODE = 'live';
  try {
    const h = harness({ timeoutAt: 'book' });
    assert.equal((await h.service.book('employee', input)).status, 'REVIEW');
    assert.equal(h.counts.book, 1);

    await h.service.reconcile();

    assert.equal((await h.service.book('employee', input)).status, 'CONFIRMED');
    assert.equal(h.counts.book, 2);
  } finally {
    if (previousMode === undefined) delete process.env.FLIGHT_MODE;
    else process.env.FLIGHT_MODE = previousMode;
  }
});

test('changed locked price stops issuance and releases funds once', async () => {
  const h = harness({ lockedAmount: 1200 });
  const receipt = await h.service.book('employee', input);
  assert.equal(receipt.status, 'REJECTED');
  assert.equal(receipt.refunded, true);
  assert.equal(h.counts.book, 0);
  assert.equal(h.counts.refunds, 1);
  await h.service.book('employee', input);
  assert.equal(h.counts.refunds, 1);
});
test('lower locked price refunds only the difference and still issues', async () => {
  const h = harness({ lockedAmount: 800 });
  const receipt = await h.service.book('employee', input);
  assert.equal(receipt.status, 'CONFIRMED');
  assert.equal(receipt.refunded, false);
  assert.equal(receipt.amount, 800);
  assert.equal(h.counts.book, 1);
  assert.equal(h.counts.refunds, 1);
  assert.equal(h.counts.transaction, 2);
});
test('definitive rejection refunds once and duplicate requests do not debit again', async () => {
  const h = harness({ status: 'rejected' });
  assert.equal((await h.service.book('employee', input)).refunded, true);
  await h.service.book('employee', input);
  assert.equal(h.counts.refunds, 1);
  assert.equal(h.counts.debit, 1);
});

test('HTTP adapter uses the documented paths and preserves return legs, passengers and tickets', async () => {
  const originalFetch = globalThis.fetch;
  const env = { ...process.env };
  delete process.env.FLIGHT_CLIENT_TOKEN_BASE64;
  process.env.FLIGHT_MODE = 'live';
  process.env.FLIGHT_CLIENT_TOKEN = 'https://example.invalid/-$fixture';
  process.env.FLIGHT_CURRENCY = 'IRR';
  process.env.FLIGHT_URL = 'https://example.invalid/flight';
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  globalThis.fetch = (async (url: URL, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url: String(url), body });
    assert.equal(
      (init.headers as Record<string, string>)['Client-Token'],
      'https://example.invalid/-$fixture',
    );
    assert.equal(new Headers(init.headers).has('Auth-Token'), false);
    const reserve = {
      confirmation_code: 'ABC',
      status: 'booked',
      total_guest_price: 10000,
      passengers: [{ id: 1, first_name_en: 'Ali', last_name_en: 'Ahmadi' }],
      tickets: [
        {
          id: 10,
          passenger_id: 1,
          pnr_code: 'PNR1',
          ticket_number: '1234',
          route_direction: 'went',
        },
      ],
    };
    return new Response(JSON.stringify({ code: 200, value: { reserve } }), {
      status: 200,
    });
  }) as typeof fetch;
  try {
    const provider = new FlightProvider();
    const paired = {
      ...offer,
      returning: {
        ...offer.departure,
        key: 'return-key',
        origin: 'MHD',
        destination: 'THR',
      },
    };
    const result = await provider.create(paired, input);
    assert.ok(calls[0].url.endsWith('/flight/api/v2/reserves/create'));
    assert.deepEqual(calls[0].body?.['flight_keys'], [
      'flight-key',
      'return-key',
    ]);
    assert.ok(calls[0].body?.['returned_flight']);
    assert.equal(
      (calls[0].body?.['passengers'] as Array<{ nationality: string }>)[0]
        .nationality,
      'IR',
    );
    assert.equal(result.totalAmount, 1000);
    assert.deepEqual(result.tickets[0], {
      id: 10,
      number: '1234',
      pnr: 'PNR1',
      passengerName: 'Ali Ahmadi',
      direction: 'went',
    });
    await provider.book('ABC');
    assert.deepEqual(calls[1].body, { confirmation_code: 'ABC' });
    await provider.inquiry('ABC');
    assert.ok(calls[2].url.endsWith('/reserves/ABC/inquiry'));
    await assert.rejects(provider.inquiry('another-id'));
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: 200, value: null }), {
        status: 200,
      })) as typeof fetch;
    assert.deepEqual(await provider.search(search), []);
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts++;
      throw new Error('secret-provider-body');
    }) as typeof fetch;
    await assert.rejects(
      provider.book('ABC'),
      (error) =>
        error instanceof Error &&
        !error.message.includes('secret-provider-body'),
    );
    assert.equal(attempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [
      'FLIGHT_MODE',
      'FLIGHT_CLIENT_TOKEN_BASE64',
      'FLIGHT_CLIENT_TOKEN',
      'FLIGHT_CURRENCY',
      'FLIGHT_URL',
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
  }
});
