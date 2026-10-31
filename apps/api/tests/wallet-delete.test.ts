import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { AdminWalletsService } from '../src/app/admin/admin-wallets.service';
import { AdminWalletsController } from '../src/app/admin/admin.controller';
import { REQUIRED_ROLES } from '../src/app/admin/roles.decorator';
import { WalletsService } from '../src/app/wallets/wallets.service';

const DAY = 24 * 60 * 60 * 1000;

async function fixture(
  run: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
) {
  const f = await createFixture();
  try {
    await run(f);
  } finally {
    await f.prisma.transaction.deleteMany({
      where: { employeeId: f.employee.id },
    });
    await f.prisma.walletAllocation.deleteMany({
      where: { employeeId: f.employee.id },
    });
    await f.prisma.walletDefinition.deleteMany({
      where: { companyId: f.company.id },
    });
    await f.prisma.employee.deleteMany({ where: { companyId: f.company.id } });
    await f.prisma.company.delete({ where: { id: f.company.id } });
    await f.prisma.$disconnect();
  }
}

async function createFixture() {
  const database = new URL(process.env.DATABASE_URL || 'http://missing');
  assert.ok(
    ['localhost', '127.0.0.1'].includes(database.hostname),
    'Wallet-delete integration tests require a local database',
  );
  const prisma = new PrismaService();
  await prisma.$connect();
  const company = await prisma.company.create({
    data: { name: `wallet-delete-test-${randomUUID()}` },
  });
  const code = `00${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
  const employee = await prisma.employee.create({
    data: {
      companyId: company.id,
      nationalCode: code,
      personnelCode: code,
      firstName: 'تست',
      lastName: 'حذف کیف پول',
      organizationalRank: 'EMPLOYEE',
    },
  });
  const wallet = async (name: string, cap: bigint, spent: bigint) => {
    const definition = await prisma.walletDefinition.create({
      data: { companyId: company.id, name },
    });
    const allocation = await prisma.walletAllocation.create({
      data: {
        employeeId: employee.id,
        definitionId: definition.id,
        cap,
        spent,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    });
    return { definition, allocation };
  };
  return {
    prisma,
    company,
    employee,
    wallet,
    admin: new AdminWalletsService(prisma),
    wallets: new WalletsService(prisma),
  };
}

test('only SUPER_ADMIN may preview or delete a wallet', () => {
  for (const handler of ['remove', 'deletionPreview'] as const) {
    assert.deepEqual(
      Reflect.getMetadata(
        REQUIRED_ROLES,
        AdminWalletsController.prototype[handler],
      ),
      ['SUPER_ADMIN'],
    );
  }
});

test('a wallet with no history is deleted outright', async () => {
  await fixture(async (f) => {
    const { definition } = await f.wallet('بی‌سابقه', 500_000n, 0n);

    const preview = await f.admin.deletionPreview(definition.id);
    assert.deepEqual(preview, {
      mode: 'delete',
      allocationCount: 1,
      affectedEmployees: 1,
      remainingAmount: 500_000,
    });

    assert.deepEqual(
      await f.admin.remove(definition.id, 'ساخته‌شده به اشتباه', 'admin-1'),
      { mode: 'delete' },
    );
    assert.equal(
      await f.prisma.walletDefinition.count({ where: { id: definition.id } }),
      0,
    );
    assert.equal(
      await f.prisma.walletAllocation.count({
        where: { definitionId: definition.id },
      }),
      0,
    );
  });
});

test('a used wallet is archived: hidden, unspendable, history kept', async () => {
  await fixture(async (f) => {
    const { definition, allocation } = await f.wallet(
      'با سابقه',
      1_000_000n,
      300_000n,
    );
    const kept = await f.wallet('دست‌نخورده', 200_000n, 0n);
    await f.prisma.transaction.create({
      data: {
        type: 'TOPUP',
        amount: 1_000_000n,
        employeeId: f.employee.id,
        allocationId: allocation.id,
      },
    });
    assert.equal((await f.wallets.forEmployee(f.employee.id)).length, 2);

    const preview = await f.admin.deletionPreview(definition.id);
    assert.equal(preview.mode, 'archive');
    assert.equal(preview.remainingAmount, 700_000);

    assert.deepEqual(
      await f.admin.remove(definition.id, 'پایان طرح', 'admin-1'),
      { mode: 'archive' },
    );
    const archived = await f.prisma.walletDefinition.findUniqueOrThrow({
      where: { id: definition.id },
      include: { allocations: true },
    });
    assert.equal(archived.isActive, false);
    assert.ok(archived.deletedAt);
    assert.equal(archived.deletedById, 'admin-1');
    assert.equal(archived.deletedNote, 'پایان طرح');
    assert.ok(archived.allocations.every((row) => !row.isActive));
    assert.equal(
      await f.prisma.transaction.count({
        where: { allocationId: allocation.id },
      }),
      1,
      'history is kept',
    );

    const visible = await f.wallets.forEmployee(f.employee.id);
    assert.deepEqual(
      visible.map((wallet) => wallet.id),
      [kept.allocation.id],
      'employees no longer see the archived wallet',
    );
    const listed = await f.admin.list({ companyId: f.company.id });
    assert.deepEqual(
      listed.items.map((row) => row.id),
      [kept.definition.id],
    );
    await assert.rejects(
      f.admin.update(definition.id, { isActive: true }),
      /کیف پول پیدا نشد/,
      'an archived wallet cannot be reactivated',
    );
    await assert.rejects(
      f.admin.remove(definition.id, 'دوباره', 'admin-1'),
      /کیف پول پیدا نشد/,
    );
  });
});
