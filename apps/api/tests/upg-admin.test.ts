import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { REQUIRED_ROLES, WRITE_ROLES } from '../src/app/admin/roles.decorator';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { UpgAdminController } from '../src/app/upg/admin/upg-admin.controller';
import { CardRefundService } from '../src/app/upg/card-refund.service';
import { GatewayRegistry } from '../src/app/upg/gateways/gateway.registry';
import { UpgService } from '../src/app/upg/upg.service';

type Call = { op: string; args: unknown };

/**
 * حداقلِ Prisma برای مسیر بررسی دستی. هر نوشتن در `calls` ثبت می‌شود تا
 * ترتیب و اتمی بودن (همه در یک `$transaction`) قابل بررسی باشد.
 */
function fakePrisma(options: {
  payment?: Record<string, unknown>;
  refund?: Record<string, unknown>;
  claim?: number;
}) {
  const calls: Call[] = [];
  let inTx = false;
  const record = (op: string) => async (args: unknown) => {
    calls.push({ op: inTx ? `tx:${op}` : op, args });
    return {};
  };
  const db = {
    gatewayPayment: {
      findUnique: async () => options.payment ?? null,
      updateMany: async (args: unknown) => {
        calls.push({
          op: inTx
            ? 'tx:gatewayPayment.updateMany'
            : 'gatewayPayment.updateMany',
          args,
        });
        return { count: options.claim ?? 1 };
      },
      update: record('gatewayPayment.update'),
      findFirst: async () => ({ id: options.payment?.['id'] }),
    },
    gatewayRefund: {
      findUnique: async () => options.refund ?? null,
      updateMany: async (args: unknown) => {
        calls.push({
          op: inTx ? 'tx:gatewayRefund.updateMany' : 'gatewayRefund.updateMany',
          args,
        });
        return { count: options.claim ?? 1 };
      },
    },
    walletAllocation: {
      findFirst: async () => ({ id: 'personal-1', cap: 0n, spent: 0n }),
      update: record('walletAllocation.update'),
    },
    transaction: { create: record('transaction.create') },
    paymentIntent: {
      findUniqueOrThrow: async () => ({ id: 'intent-1', status: 'EXPIRED' }),
      updateMany: record('paymentIntent.updateMany'),
    },
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => {
      inTx = true;
      try {
        return await run(db);
      } finally {
        inTx = false;
      }
    },
  };
  return { prisma: db as unknown as PrismaService, calls };
}

const unknownPayment = {
  id: 'pay-1',
  intentId: 'intent-1',
  employeeId: 'emp-1',
  gateway: 'toman',
  status: 'UNKNOWN',
  amount: 250_000n,
  intent: { title: 'هتل' },
};

test('every manual decision is WRITE_ROLES-only; reads and inquiries are open to VIEWER', () => {
  const roles = (method: keyof UpgAdminController) =>
    Reflect.getMetadata(REQUIRED_ROLES, UpgAdminController.prototype[method]);
  assert.deepEqual(roles('reviewPayment'), WRITE_ROLES);
  assert.deepEqual(roles('reviewRefund'), WRITE_ROLES);
  for (const read of [
    'payments',
    'payment',
    'queue',
    'queueCount',
    'refundWallets',
    'settings',
    'inquirePayment',
    'inquireRefund',
  ] as const) {
    assert.equal(roles(read), undefined, read);
  }
});

test('manually verified UNKNOWN payment tops up the personal wallet and writes the audit note in the same transaction', async () => {
  const { prisma, calls } = fakePrisma({ payment: unknownPayment });
  const upg = new UpgService(prisma, new GatewayRegistry());
  await upg.resolveUnknownPayment('pay-1', 'verified', async (tx) => {
    await (tx as typeof prisma).transaction.create({
      data: { audit: true },
    } as never);
  });

  const ops = calls.map((call) => call.op);
  assert.deepEqual(ops, [
    'tx:gatewayPayment.updateMany',
    'tx:walletAllocation.update',
    'tx:transaction.create',
    'tx:transaction.create', // audit
  ]);
  const claim = calls[0].args as {
    where: { status: { in: string[] } };
    data: { status: string };
  };
  assert.deepEqual(claim.where.status.in, ['UNKNOWN']);
  assert.equal(claim.data.status, 'VERIFIED');
  assert.deepEqual((calls[1].args as { data: unknown }).data, {
    cap: { increment: 250_000n },
  });
  const topUp = (calls[2].args as { data: Record<string, unknown> }).data;
  assert.equal(topUp['type'], 'TOPUP');
  assert.equal(topUp['amount'], 250_000n);
  assert.equal(topUp['gatewayPaymentId'], 'pay-1');
});

test('manually failed UNKNOWN payment moves no money', async () => {
  const { prisma, calls } = fakePrisma({ payment: unknownPayment });
  const upg = new UpgService(prisma, new GatewayRegistry());
  let audited = false;
  await upg.resolveUnknownPayment('pay-1', 'failed', async () => {
    audited = true;
  });
  assert.ok(audited);
  assert.deepEqual(
    calls.map((call) => call.op),
    ['tx:gatewayPayment.updateMany'],
  );
  assert.equal(
    (calls[0].args as { data: { status: string } }).data.status,
    'FAILED',
  );
});

test('a payment that is no longer UNKNOWN is refused, and a concurrent change writes no audit', async () => {
  const verified = fakePrisma({
    payment: { ...unknownPayment, status: 'VERIFIED' },
  });
  await assert.rejects(
    new UpgService(
      verified.prisma,
      new GatewayRegistry(),
    ).resolveUnknownPayment('pay-1', 'verified', async () =>
      assert.fail('must not audit'),
    ),
    ConflictException,
  );

  const raced = fakePrisma({ payment: unknownPayment, claim: 0 });
  await assert.rejects(
    new UpgService(raced.prisma, new GatewayRegistry()).resolveUnknownPayment(
      'pay-1',
      'verified',
      async () => assert.fail('must not audit'),
    ),
    ConflictException,
  );
  assert.deepEqual(
    raced.calls.map((call) => call.op),
    ['tx:gatewayPayment.updateMany'],
    'no top-up when the claim lost the race',
  );
});

const stuckRefund = {
  id: 'ref-1',
  gatewayPaymentId: 'pay-1',
  employeeId: 'emp-1',
  gateway: 'toman',
  amount: 40_000n,
  status: 'SUBMITTING',
  ref: null,
};

test('manually failed refund credits the amount back through creditBack, with the audit note', async () => {
  const { prisma, calls } = fakePrisma({ refund: stuckRefund });
  const service = new CardRefundService(prisma, new GatewayRegistry());
  let audited = false;
  await service.resolveManually(
    'ref-1',
    'failed',
    'در پنل تومان ثبت نشده بود',
    async () => {
      audited = true;
    },
  );
  assert.ok(audited);
  assert.deepEqual(
    calls.map((call) => call.op),
    [
      'tx:gatewayRefund.updateMany',
      'tx:gatewayPayment.update',
      'tx:walletAllocation.update',
      'tx:transaction.create',
    ],
  );
  const claim = (calls[0].args as { data: { status: string; error: string } })
    .data;
  assert.equal(claim.status, 'FAILED');
  assert.match(claim.error, /بررسی دستی/);
  assert.deepEqual((calls[1].args as { data: unknown }).data, {
    refundedAmount: { decrement: 40_000n },
  });
  assert.deepEqual((calls[2].args as { data: unknown }).data, {
    cap: { increment: 40_000n },
  });
});

test('manually succeeded refund only closes it — the balance was debited at request time', async () => {
  const { prisma, calls } = fakePrisma({
    refund: { ...stuckRefund, status: 'UNKNOWN' },
  });
  await new CardRefundService(prisma, new GatewayRegistry()).resolveManually(
    'ref-1',
    'succeeded',
    'در پنل تومان موفق بود',
    async () => undefined,
  );
  assert.deepEqual(
    calls.map((call) => call.op),
    ['tx:gatewayRefund.updateMany'],
  );

  const final = fakePrisma({ refund: { ...stuckRefund, status: 'SUCCEEDED' } });
  await assert.rejects(
    new CardRefundService(final.prisma, new GatewayRegistry()).resolveManually(
      'ref-1',
      'failed',
      'دیر رسید',
      async () => assert.fail('must not audit'),
    ),
    ConflictException,
  );
});
