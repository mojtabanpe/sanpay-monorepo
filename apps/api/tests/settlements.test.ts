import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AdminJwtGuard } from '../src/app/admin/admin-jwt.guard';
import { validate } from 'class-validator';
import { PrismaService } from '../src/app/prisma/prisma.service';
import {
  SettlementsService,
  settlementItemWhere,
} from '../src/app/settlements/settlements.service';
import {
  RunStoreSettlementDto,
  SettlementItemQueryDto,
  SettlementsController,
} from '../src/app/settlements/settlements.controller';
import {
  TomanClientService,
  TomanTransferItemInput,
} from '../src/app/settlements/toman-client.service';

async function fixture(
  run: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
) {
  const f = await createFixture();
  try {
    await run(f);
  } finally {
    const items = await f.db.settlementItem.findMany({
      where: { storeId: { in: f.stores.map((s) => s.id) } },
      select: { batchId: true },
    });
    await f.db.payment.deleteMany({ where: { employeeId: f.employee.id } });
    await f.db.hotelBooking.deleteMany({
      where: { employeeId: f.employee.id },
    });
    // Retry relations must be removed before their parent items.
    await f.db.settlementItem.deleteMany({
      where: {
        storeId: { in: f.stores.map((s) => s.id) },
        retryOfId: { not: null },
      },
    });
    await f.db.settlementItem.deleteMany({
      where: { storeId: { in: f.stores.map((s) => s.id) } },
    });
    await f.db.settlementBatch.deleteMany({
      where: { id: { in: items.map((i) => i.batchId) } },
    });
    await f.db.store.deleteMany({
      where: { id: { in: f.stores.map((s) => s.id) } },
    });
    await f.db.employee.delete({ where: { id: f.employee.id } });
    await f.db.company.delete({ where: { id: f.company.id } });
    await f.db.$disconnect();
  }
}

async function createFixture() {
  assert.ok(
    ['localhost', '127.0.0.1'].includes(
      new URL(process.env.DATABASE_URL || 'http://missing').hostname,
    ),
    'Tests require a local database',
  );
  const db = new PrismaService();
  await db.$connect();
  const company = await db.company.create({
    data: { name: `settlement-test-${randomUUID()}` },
  });
  const employee = await db.employee.create({
    data: {
      companyId: company.id,
      firstName: 'تست',
      lastName: 'تسویه',
      organizationalRank: 'EMPLOYEE',
      nationalCode: randomUUID(),
      personnelCode: randomUUID(),
    },
  });
  const stores = await Promise.all(
    [0, 1].map((i) =>
      db.store.create({
        data: {
          name: `فروشگاه آزمایشی ${i}`,
          code: randomUUID(),
          username: randomUUID(),
          passwordHash: 'unused',
          settlementIban: 'IR062960000000100324200001',
          settlementOwnerName: 'صاحب حساب آزمایشی',
        },
      }),
    ),
  );
  const payments = await Promise.all(
    stores.map((s, i) =>
      db.payment.create({
        data: {
          employeeId: employee.id,
          storeId: s.id,
          amount: BigInt(10000 * (i + 1)),
          receiptNo: randomUUID(),
        },
      }),
    ),
  );
  const booking = await db.hotelBooking.create({
    data: {
      employeeId: employee.id,
      referenceNo: randomUUID(),
      provider: 'hy',
      status: 'CONFIRMED',
      hotelId: 'hy:test',
      hotelName: 'تست',
      roomId: 'test',
      roomType: 'test',
      checkin: new Date(),
      nights: 1,
      guestName: 'تست',
      guestIdNo: 'test',
      amount: 100n,
      payable: 100n,
    },
  });
  const state = {
    status: 2,
    creates: 0,
    commits: 0,
    failCommit: false,
    failInquiry: false,
    items: [] as TomanTransferItemInput[],
  };
  const toman = {
    isLive: () => false,
    createBatch: async (amount: number, count: number) => {
      assert.equal(count, 1);
      assert.equal(amount, 100000);
      state.creates++;
      return { uuid: randomUUID(), status: 1 };
    },
    listBatchItems: async () => [],
    addItems: async (_: string, items: TomanTransferItemInput[]) => {
      state.items.push(...items);
      return items.map((i) => ({ ...i, uuid: randomUUID() }));
    },
    commitBatch: async () => {
      state.commits++;
      if (state.failCommit) throw new Error('simulated commit timeout');
    },
    getBatch: async () => ({ status: state.failCommit ? 1 : 4 }),
    getTransfer: async () => {
      if (state.failInquiry) throw new Error('simulated inquiry timeout');
      return {
        status: state.status,
        uuid: randomUUID(),
        follow_up_code: 'test-followup',
        receipt_link: null,
      };
    },
  };
  const jwt = new JwtService({ secret: 'settlement-test-only-secret' });
  const service = new SettlementsService(
    db,
    toman as unknown as TomanClientService,
    jwt,
  );
  return {
    db,
    service,
    company,
    employee,
    stores,
    payments,
    booking,
    state,
    jwt,
  };
}

test('manual API rejects the old unscoped payload and missing preview token', async () => {
  const dto = Object.assign(new RunStoreSettlementDto(), {});
  assert.equal((await validate(dto)).length, 2);
  dto.storeId = randomUUID();
  assert.ok((await validate(dto)).some((e) => e.property === 'previewToken'));
});

test('preview does not send or claim; manual run isolates one store and never includes hotel bookings', async () =>
  fixture(async (f) => {
    const preview = await f.service.previewStore(f.stores[0].id);
    assert.equal(preview.totalAmount, 10000);
    assert.equal(preview.paymentCount, 1);
    assert.equal(f.state.creates, 0);
    assert.equal(
      (
        await f.db.payment.findUniqueOrThrow({
          where: { id: f.payments[0].id },
        })
      ).settlementItemId,
      null,
    );
    const batch = await f.service.runManual(
      preview.storeId,
      preview.previewToken,
    );
    assert.equal(batch.items.length, 1);
    assert.equal(batch.items[0].storeId, f.stores[0].id);
    assert.equal(batch.status, 'PROCESSING');
    assert.equal(f.state.items[0].amount, 100000, 'toman is converted to rial');
    assert.equal(f.state.items[0].iban_destination, preview.destinationIban);
    assert.equal(
      (
        await f.db.payment.findUniqueOrThrow({
          where: { id: f.payments[1].id },
        })
      ).settlementItemId,
      null,
    );
    assert.equal(
      (
        await f.db.hotelBooking.findUniqueOrThrow({
          where: { id: f.booking.id },
        })
      ).settlementItemId,
      null,
    );
    assert.equal(
      (
        await f.db.payment.findUniqueOrThrow({
          where: { id: f.payments[0].id },
        })
      ).settledAt,
      null,
    );
    const old = process.env.TOMAN_SETTLEMENTS_ENABLED;
    process.env.TOMAN_SETTLEMENTS_ENABLED = 'false';
    try {
      f.state.status = 6;
      const final = await f.service.reconcileBatch(batch.id);
      assert.equal(final.status, 'COMPLETED');
      assert.ok(
        (
          await f.db.payment.findUniqueOrThrow({
            where: { id: f.payments[0].id },
          })
        ).settledAt,
      );
      assert.equal(final.items[0].followUpCode, 'test-followup');
    } finally {
      if (old === undefined) delete process.env.TOMAN_SETTLEMENTS_ENABLED;
      else process.env.TOMAN_SETTLEMENTS_ENABLED = old;
    }
    assert.equal(f.state.creates, 1);
  }));

test('replaying or concurrently submitting one approval makes only one transfer', async () =>
  fixture(async (f) => {
    const p = await f.service.previewStore(f.stores[0].id);
    const results = await Promise.all([
      f.service.runManual(p.storeId, p.previewToken),
      f.service.runManual(p.storeId, p.previewToken),
    ]);
    assert.equal(results[0].id, results[1].id);
    assert.equal(
      (await f.service.runManual(p.storeId, p.previewToken)).id,
      results[0].id,
    );
    assert.equal(f.state.creates, 1);
    assert.equal(f.state.commits, 1);
  }));

test('two different approvals racing for the same purchases cannot double settle', async () =>
  fixture(async (f) => {
    const a = await f.service.previewStore(f.stores[0].id);
    const b = await f.service.previewStore(f.stores[0].id);
    const results = await Promise.allSettled([
      f.service.runManual(a.storeId, a.previewToken),
      f.service.runManual(b.storeId, b.previewToken),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(f.state.creates, 1);
  }));

test('wrong store, expired/tampered token, changed amount and destination are rejected before sending', async () =>
  fixture(async (f) => {
    const p = await f.service.previewStore(f.stores[0].id);
    await assert.rejects(
      f.service.runManual(f.stores[1].id, p.previewToken),
      /مطابقت/,
    );
    await assert.rejects(
      f.service.runManual(p.storeId, p.previewToken + 'x'),
      /معتبر/,
    );
    const decoded = f.jwt.decode(p.previewToken);
    const expired = f.jwt.sign({
      ...decoded,
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    await assert.rejects(f.service.runManual(p.storeId, expired), /منقضی/);
    await f.db.payment.update({
      where: { id: f.payments[0].id },
      data: { amount: 11000n },
    });
    await assert.rejects(
      f.service.runManual(p.storeId, p.previewToken),
      /تغییر/,
    );
    const next = await f.service.previewStore(p.storeId);
    await f.db.store.update({
      where: { id: p.storeId },
      data: { settlementIban: 'IR820540102680020817909002' },
    });
    await assert.rejects(
      f.service.runManual(next.storeId, next.previewToken),
      /تغییر/,
    );
    assert.equal(f.state.creates, 0);
  }));

test('invalid IBAN, empty and inactive stores and changed Toman configuration reject execution', async () =>
  fixture(async (f) => {
    await f.db.store.update({
      where: { id: f.stores[0].id },
      data: { settlementIban: null },
    });
    await assert.rejects(f.service.previewStore(f.stores[0].id), /شبا/);
    await f.db.store.update({
      where: { id: f.stores[0].id },
      data: { isActive: false },
    });
    await assert.rejects(f.service.previewStore(f.stores[0].id), /فعال/);
    const p = await f.service.previewStore(f.stores[1].id);
    const old = process.env.TOMAN_API_URL;
    process.env.TOMAN_API_URL = 'https://changed.invalid';
    try {
      await assert.rejects(
        f.service.runManual(p.storeId, p.previewToken),
        /تنظیمات/,
      );
    } finally {
      if (old === undefined) delete process.env.TOMAN_API_URL;
      else process.env.TOMAN_API_URL = old;
    }
    await f.db.payment.delete({ where: { id: f.payments[1].id } });
    await assert.rejects(f.service.previewStore(f.stores[1].id), /خرید تسویه/);
    assert.equal(f.state.creates, 0);
  }));

test('failed submission preserves purchases, inquiry does not send, approval retry does not duplicate', async () =>
  fixture(async (f) => {
    const p = await f.service.previewStore(f.stores[0].id);
    f.state.failCommit = true;
    await assert.rejects(
      f.service.runManual(p.storeId, p.previewToken),
      /timeout/,
    );
    const batch = await f.service.runManual(p.storeId, p.previewToken);
    assert.equal(batch.status, 'FAILED');
    assert.match(batch.error ?? '', /timeout/);
    assert.equal((await f.service.reconcileBatch(batch.id)).status, 'FAILED');
    assert.equal(f.state.creates, 1);
    assert.equal(f.state.commits, 1);
    await assert.rejects(f.service.previewStore(p.storeId), /خرید تسویه/);
  }));

test('retrying a final failed transfer cannot send the same failed item twice', async () =>
  fixture(async (f) => {
    f.state.status = 9;
    const p = await f.service.previewStore(f.stores[0].id);
    const batch = await f.service.runManual(p.storeId, p.previewToken);
    assert.equal(batch.items[0].status, 'FAILED');
    f.state.status = 6;
    const retried = await f.service.retryFailedItem(batch.items[0].id);
    assert.equal(retried.status, 'COMPLETED');
    assert.equal(
      (await f.service.retryFailedItem(batch.items[0].id)).id,
      retried.id,
    );
    assert.equal(f.state.creates, 2);
  }));

@Module({})
class SettlementHttpTestModule {}

test('HTTP routes require settlement write access and reject missing approval before any gateway call', async () =>
  fixture(async (f) => {
    const admin = await f.db.admin.create({
      data: {
        username: `settlement-test-${randomUUID()}`,
        name: 'تست دسترسی',
        passwordHash: 'unused',
        role: 'ADMIN',
        permissions: ['settlements:read'],
      },
    });
    const app = await NestFactory.create(
      {
        module: SettlementHttpTestModule,
        controllers: [SettlementsController],
        providers: [
          AdminJwtGuard,
          { provide: PrismaService, useValue: f.db },
          { provide: JwtService, useValue: f.jwt },
          { provide: SettlementsService, useValue: f.service },
        ],
      },
      { logger: false },
    );
    try {
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/admin/settlements`;
      const token = await f.jwt.signAsync({ sub: admin.id, role: 'admin' });
      const headers = {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      };
      assert.equal((await fetch(`${url}/stores`)).status, 401);
      assert.equal((await fetch(`${url}/stores`, { headers })).status, 200);
      assert.equal(
        (
          await fetch(`${url}/preview`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ storeId: f.stores[0].id }),
          })
        ).status,
        403,
      );
      await f.db.admin.update({
        where: { id: admin.id },
        data: { permissions: ['settlements:read', 'settlements:write'] },
      });
      assert.equal(
        (await fetch(`${url}/run`, { method: 'POST', headers, body: '{}' }))
          .status,
        400,
      );
      assert.equal(
        (
          await fetch(`${url}/run`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ storeId: f.stores[0].id }),
          })
        ).status,
        400,
      );
      const response = await fetch(`${url}/preview`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId: f.stores[0].id }),
      });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).totalAmount, 10000);
      assert.equal(f.state.creates, 0);
    } finally {
      await app.close();
      await f.db.admin.delete({ where: { id: admin.id } });
    }
  }));

test('an inquiry failure is visible, does not settle purchases and clears after a successful inquiry', async () =>
  fixture(async (f) => {
    const p = await f.service.previewStore(f.stores[0].id);
    const batch = await f.service.runManual(p.storeId, p.previewToken);
    f.state.failInquiry = true;
    const failedInquiry = await f.service.reconcileBatch(batch.id);
    assert.match(
      failedInquiry.items[0].error ?? '',
      /استعلام وضعیت انتقال ناموفق/,
    );
    assert.equal(
      (
        await f.db.payment.findUniqueOrThrow({
          where: { id: f.payments[0].id },
        })
      ).settledAt,
      null,
    );
    f.state.failInquiry = false;
    f.state.status = 6;
    const final = await f.service.reconcileBatch(batch.id);
    assert.equal(final.status, 'COMPLETED');
    assert.equal(final.items[0].error, null);
    assert.equal(f.state.commits, 1);
  }));

test('settlement table filters by status, beneficiary, text and whole Tehran days', async () => {
  assert.deepEqual(settlementItemWhere({}), {});
  const where = settlementItemWhere({
    q: '  IR12  ',
    status: 'FAILED',
    beneficiaryType: 'HOTELYAR',
    from: '2026-10-28',
    to: '2026-10-29',
  });
  assert.equal(where.status, 'FAILED');
  assert.equal(where.beneficiaryType, 'HOTELYAR');
  // 00:00 Tehran on the 28th up to (not including) 00:00 Tehran on the 30th
  assert.deepEqual(where.createdAt, {
    gte: new Date('2026-10-27T20:30:00.000Z'),
    lt: new Date('2026-10-29T20:30:00.000Z'),
  });
  assert.deepEqual(where.OR, [
    { beneficiaryName: { contains: 'IR12', mode: 'insensitive' } },
    { followUpCode: { contains: 'IR12' } },
    { trackerId: { contains: 'IR12' } },
    { batch: { runKey: { contains: 'IR12' } } },
  ]);
  assert.equal(settlementItemWhere({ q: '   ' }).OR, undefined);

  for (const bad of [
    { status: 'DONE' },
    { beneficiaryType: 'EMPLOYEE' },
    { from: '2026-10-28T00:00:00Z' },
    { pageSize: 500 },
  ]) {
    const dto = Object.assign(new SettlementItemQueryDto(), bad);
    assert.ok((await validate(dto)).length > 0, JSON.stringify(bad));
  }
});

test('settlement table pages on the server, sums every filtered row and flags retried transfers', async () => {
  const calls: Record<string, unknown> = {};
  const prisma = {
    settlementItem: {
      findMany: async (args: unknown) => {
        calls.findMany = args;
        return [
          {
            id: 'item-1',
            beneficiaryName: 'فروشگاه',
            beneficiaryType: 'STORE',
            amount: 120_000n,
            status: 'FAILED',
            followUpCode: null,
            error: 'رد شد',
            createdAt: new Date('2026-10-28T08:00:00Z'),
            settledAt: null,
            retryOfId: null,
            destinationIban: 'IR000000000000000000000000',
            trackerId: 'sp-secret',
            _count: { retries: 1 },
            batch: { id: 'b', runKey: '2026-10-28', status: 'FAILED', error: null },
          },
        ];
      },
      count: async () => 41,
      aggregate: async () => ({ _sum: { amount: 9_000_000n } }),
    },
  };
  const service = new SettlementsService(
    prisma as unknown as PrismaService,
    {} as TomanClientService,
    {} as JwtService,
  );
  const result = await service.listItems({ status: 'FAILED', page: 3, pageSize: 20 });
  assert.equal(result.total, 41);
  assert.equal(result.sumAmount, 9_000_000);
  assert.equal(result.items[0].amount, 120_000);
  assert.equal(result.items[0].retried, true);
  assert.equal('destinationIban' in result.items[0], false);
  assert.deepEqual(
    { skip: (calls.findMany as { skip: number }).skip, take: (calls.findMany as { take: number }).take },
    { skip: 40, take: 20 },
  );
});

test('the items route is registered before the batch id route', () => {
  const names = Object.getOwnPropertyNames(SettlementsController.prototype);
  assert.ok(names.indexOf('items') < names.indexOf('one'));
});
