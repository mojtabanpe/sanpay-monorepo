import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  FlightBookingInput,
  FlightOffer,
  FlightSearchInput,
} from '@sanpay/models';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { Prisma } from '../src/generated/prisma/client';
import { FlightsService } from '../src/app/tourism/flights/flights.service';
import { FlightProvider } from '../src/app/tourism/flights/flight-provider';

test('PostgreSQL: simultaneous bookings never overspend; rejection refunds once', async () => {
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(process.env.DATABASE_URL ?? '').hostname,
    ),
    'This integration test only runs against a local database',
  );
  const db = new PrismaService();
  const suffix = randomUUID();
  const companyId = randomUUID(),
    employeeId = randomUUID(),
    definitionId = randomUUID(),
    allocationId = randomUUID();
  const search: FlightSearchInput = {
    origin: 'THR',
    destination: 'MHD',
    departureDate: '2090-01-01',
    adults: 1,
    children: 0,
    infants: 0,
  };
  const offer: FlightOffer = {
    id: 'fixture',
    amount: 1000,
    returning: null,
    departure: {
      key: 'test',
      origin: 'THR',
      destination: 'MHD',
      departureTime: '2090-01-01 12:00:00',
      arrivalTime: '2090-01-01 14:00:00',
      airline: 'IR',
      flightNumber: 'TEST',
      flightClass: 'economy',
      flightType: 'charter',
      baggage: 20,
      stops: 0,
      capacity: 9,
      foreign: false,
      cancellationRules: [],
    },
  };
  let createCalls = 0;
  let status = 'booked';
  const provider = {
    assertConfigured: () => undefined,
    search: async () => [offer],
    create: async () => {
      createCalls++;
      return {
        confirmationCode: randomUUID(),
        status: 'approved',
        totalAmount: 1000,
        tickets: [],
      };
    },
    book: async (confirmationCode: string) => ({
      confirmationCode,
      status,
      tickets: [],
    }),
  } as unknown as FlightProvider;
  const service = new FlightsService(db, provider);
  const input: FlightBookingInput = {
    quoteId: '',
    allocationId,
    bookerFirstName: 'تست',
    bookerLastName: 'پرواز',
    mobile: '09121234567',
    passengers: [
      {
        firstName: 'Test',
        lastName: 'Flight',
        birthdate: '2070-01-01',
        nationality: 'IR',
        nationalCode: '0492578631',
        gender: 'male',
        type: 'adult',
      },
    ],
  };
  const quote = () =>
    db.flightQuote.create({
      data: {
        employeeId,
        search: search as unknown as Prisma.InputJsonValue,
        offer: offer as unknown as Prisma.InputJsonValue,
        amount: 1000n,
        expiresAt: new Date(Date.now() + 300000),
      },
    });
  try {
    await db.company.create({
      data: { id: companyId, name: `flight-test-${suffix}` },
    });
    await db.employee.create({
      data: {
        id: employeeId,
        companyId,
        nationalCode: `test-${suffix}`,
        personnelCode: `test-${suffix}`,
        firstName: 'Test',
        lastName: 'Flight',
        organizationalRank: 'EMPLOYEE',
      },
    });
    await db.walletDefinition.create({
      data: {
        id: definitionId,
        companyId,
        kind: 'TOURISM',
        name: 'Flight test',
      },
    });
    await db.walletAllocation.create({
      data: {
        id: allocationId,
        employeeId,
        definitionId,
        cap: 1500n,
        expiresAt: new Date('2099-01-01'),
      },
    });
    const [a, b] = await Promise.all([quote(), quote()]);
    const results = await Promise.allSettled([
      service.book(employeeId, { ...input, quoteId: a.id }),
      service.book(employeeId, { ...input, quoteId: b.id }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(createCalls, 1);
    assert.equal(
      (
        await db.walletAllocation.findUniqueOrThrow({
          where: { id: allocationId },
        })
      ).spent,
      1000n,
    );
    assert.equal(
      await db.transaction.count({ where: { employeeId, type: 'PURCHASE' } }),
      1,
    );
    await db.walletAllocation.update({
      where: { id: allocationId },
      data: { cap: 5000n },
    });
    const c = await quote();
    await Promise.allSettled([
      service.book(employeeId, { ...input, quoteId: c.id }),
      service.book(employeeId, { ...input, quoteId: c.id }),
    ]);
    assert.equal(createCalls, 2);
    assert.equal(await db.flightBooking.count({ where: { quoteId: c.id } }), 1);
    assert.equal(
      (
        await db.walletAllocation.findUniqueOrThrow({
          where: { id: allocationId },
        })
      ).spent,
      2000n,
    );
    status = 'rejected';
    const d = await quote();
    const rejected = await service.book(employeeId, {
      ...input,
      quoteId: d.id,
    });
    assert.equal(rejected.refunded, true);
    await service.book(employeeId, { ...input, quoteId: d.id });
    assert.equal(
      await db.transaction.count({ where: { employeeId, type: 'REFUND' } }),
      1,
    );
    assert.equal(
      (
        await db.walletAllocation.findUniqueOrThrow({
          where: { id: allocationId },
        })
      ).spent,
      2000n,
    );
  } finally {
    // Delete only fixtures identified by the random IDs generated by this test.
    await db.flightBooking.deleteMany({ where: { employeeId } });
    await db.flightQuote.deleteMany({ where: { employeeId } });
    await db.transaction.deleteMany({ where: { employeeId } });
    await db.walletAllocation.deleteMany({ where: { id: allocationId } });
    await db.walletDefinition.deleteMany({ where: { id: definitionId } });
    await db.employee.deleteMany({ where: { id: employeeId } });
    await db.company.deleteMany({ where: { id: companyId } });
    await db.$disconnect();
  }
});
