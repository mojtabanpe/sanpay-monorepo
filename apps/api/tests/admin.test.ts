import 'reflect-metadata';
// Authorization checks use real Nest metadata and the database state, not JWT grants.
import { Reflector } from '@nestjs/core';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { AdminJwtGuard } from '../src/app/admin/admin-jwt.guard';
import { AdminAuthService } from '../src/app/admin/admin-auth.service';
import { AdminAccess } from '../src/app/admin/permissions.decorator';
import { Roles } from '../src/app/admin/roles.decorator';
import { CreateAdminDto, UpdateAdminDto } from '../src/app/admin/dto/admin.dto';
import { AdminPermission, normalizeAdminPermissions } from '@sanpay/models';

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { AuthService, JwtPayload } from '../src/app/auth/auth.service';
import { SmsService } from '../src/app/auth/sms.service';
import {
  AdminEmployeesService,
  validateBirthDate,
} from '../src/app/admin/admin-employees.service';
import { JwtAuthGuard } from '../src/app/auth/jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';

const current = {
  id: 'employee-1',
  nationalCode: '0012345678',
  phone: '09123456789',
  companyId: 'company-1',
  company: { id: 'company-1', name: 'جهان فولاد', isActive: true },
  isActive: true,
  deletedAt: null,
  passwordHash: 'hash',
  birthDate: null,
  firstName: 'علی',
  lastName: 'رضایی',
  personnelCode: 'legacy',
  organizationalRank: 'EMPLOYEE',
};
const payload: JwtPayload = {
  sid: 'session-1',
  sub: current.id,
  nationalCode: current.nationalCode,
  authMethod: 'PASSWORD',
  requiresPasswordSetup: false,
};

test('employee deletion archives identity and disables allocations without deleting financial history', async () => {
  const changes: unknown[] = [];
  const tx = {
    employee: { update: async (change: unknown) => changes.push(change) },
    walletAllocation: {
      updateMany: async (change: unknown) => changes.push(change),
    },
  };
  const prisma = {
    employee: { findUnique: async () => current },
    $transaction: async (run: (client: typeof tx) => Promise<void>) => run(tx),
  };
  await new AdminEmployeesService(prisma as unknown as PrismaService).remove(
    current.id,
  );
  assert.equal(changes.length, 2);
  assert.equal(
    (changes[0] as { data: { isActive: boolean; deletedAt: Date } }).data
      .isActive,
    false,
  );
  assert.ok(
    (changes[0] as { data: { deletedAt: Date } }).data.deletedAt instanceof
      Date,
  );
  assert.deepEqual(changes[1], {
    where: { employeeId: current.id },
    data: { isActive: false },
  });
});

test('archived employees cannot reuse an existing JWT', async () => {
  const jwt = { verifyAsync: async () => payload };
  const prisma = { employee: { findFirst: async () => null } };
  const guard = new JwtAuthGuard(
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
  );
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: 'Bearer existing-token' },
        url: '/api/wallets',
      }),
    }),
  };
  await assert.rejects(
    guard.canActivate(context as unknown as ExecutionContext),
    UnauthorizedException,
  );
});

test('birth dates reject impossible and future dates at the API boundary', () => {
  assert.doesNotThrow(() => validateBirthDate('1991-10-07'));
  assert.throws(() => validateBirthDate('2000-02-31'));
  assert.throws(() => validateBirthDate('2090-01-01'));
  assert.throws(() => validateBirthDate('1991-10-07T00:00:00Z'));
});

test('birthday greetings use the Persian calendar at Tehran midnight', async (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: Date.parse('2026-10-06T20:29:59Z'),
  });
  const prisma = {
    employee: {
      findUnique: async () => ({
        ...current,
        birthDate: new Date('1991-10-07T00:00:00Z'),
      }),
    },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    {} as SmsService,
  );
  assert.equal((await service.profile(current.id)).birthdayToday, false);
  t.mock.timers.tick(1000);
  assert.equal((await service.profile(current.id)).birthdayToday, true);
});

test('same national code in another company cannot reuse an existing phone', async () => {
  let checked: unknown;
  const prisma = {
    company: { findFirst: async () => current.company },
    employee: {
      findFirst: async ({ where }: { where: unknown }) => {
        checked = where;
        return current;
      },
    },
  };
  await assert.rejects(
    new AdminEmployeesService(prisma as unknown as PrismaService).create({
      companyId: 'company-2',
      nationalCode: current.nationalCode,
      phone: current.phone,
      firstName: 'علی',
      lastName: 'رضایی',
      organizationalRank: 'EMPLOYEE',
    }),
    /شماره موبایل/,
  );
  assert.ok(
    (checked as { OR: { phone?: string }[] }).OR.some(
      (clause) => clause.phone === current.phone,
    ),
  );
});

test('password login selects independent accounts by phone even with identical national codes and passwords', async () => {
  const bcrypt = await import('bcrypt');
  const passwordHash = await bcrypt.hash('SharedPassword123!', 4);
  const first = { ...current, passwordHash };
  const second = {
    ...first,
    id: 'employee-2',
    phone: '09121111111',
    companyId: 'company-2',
    company: { ...first.company, id: 'company-2' },
  };
  const prisma = {
    employee: {
      findFirst: async ({ where }: { where: { phone: string } }) =>
        [first, second].find((row) => row.phone === where.phone) ?? null,
    },
    employeeSession: { create: async () => ({}) },
  };
  const notices: string[] = [];
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {
      signAsync: async (payload: JwtPayload) => JSON.stringify(payload),
    } as unknown as JwtService,
    {
      sendLoginNotice: (phone: string) => notices.push(phone),
    } as unknown as SmsService,
  );
  const firstResponse = await service.login(first.phone, 'SharedPassword123!');
  assert.equal(firstResponse.employee.id, first.id);
  const response = await service.login(second.phone, 'SharedPassword123!');
  assert.equal(response.employee.id, second.id);
  assert.equal(JSON.parse(response.accessToken).sub, second.id);
  // اعلان ورود به شمارهٔ همان حسابی می‌رود که وارد شد
  assert.deepEqual(notices, [first.phone, second.phone]);
  await assert.rejects(
    service.login('09120000000', 'SharedPassword123!'),
    UnauthorizedException,
  );
});

test('password login requires a valid phone and password without national code', async () => {
  const { validate } = await import('class-validator');
  const { LoginDto } = await import('../src/app/auth/dto/login.dto');
  assert.equal(
    (
      await validate(
        Object.assign(new LoginDto(), {
          phone: current.phone,
          password: 'Password123!',
        }),
      )
    ).length,
    0,
  );
  assert.ok(
    (
      await validate(
        Object.assign(new LoginDto(), { password: 'Password123!' }),
      )
    ).length > 0,
  );
});

test('authenticated profile returns the logo of the employee company', async () => {
  const company = {
    ...current.company,
    logoUrl: 'https://example.test/company-a.png',
  };
  const prisma = {
    employee: { findUnique: async () => ({ ...current, company }) },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    {} as SmsService,
  );
  assert.deepEqual((await service.profile(current.id)).company, {
    id: company.id,
    name: company.name,
    logoUrl: company.logoUrl,
  });
});

// شارژ باید افزایشی باشد، حتی وقتی مبلغ جدید از مصرف قبلی کمتر است.
test('wallet top-up adds credit without resetting spent, records exact amount', async () => {
  const allocation = {
    id: 'allocation-1',
    employeeId: current.id,
    definitionId: 'definition-1',
    cap: 1000n,
    spent: 800n,
    isActive: true,
    expiresAt: new Date('2100-01-01'),
    createdAt: new Date(),
    definition: { name: 'ارزاق', kind: 'RATION', icon: null, isActive: true },
  };
  const events: Array<{
    data: { amount: bigint; type: string; allocationId: string };
  }> = [];
  const tx = {
    walletAllocation: {
      findUnique: async () => allocation,
      update: async ({ data }: { data: { cap: { increment: bigint } } }) => {
        assert.deepEqual(data, { cap: { increment: 50n } });
        return { ...allocation, cap: allocation.cap + data.cap.increment };
      },
    },
    transaction: {
      create: async (event: (typeof events)[number]) => events.push(event),
    },
  };
  const prisma = {
    $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      run(tx),
  };
  const service = new AdminEmployeesService(prisma as unknown as PrismaService);
  const result = await service.topUpAllocation(allocation.id, 50);
  assert.equal(result.remaining, 250);
  assert.equal(result.spent, 800);
  assert.equal(events.length, 1);
  assert.equal(events[0].data.type, 'TOPUP');
  assert.equal(events[0].data.amount, 50n);
  assert.equal(events[0].data.allocationId, allocation.id);
  for (const invalid of [0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(service.topUpAllocation(allocation.id, invalid));
  }
});

test('wallet top-up rejects personal, inactive and expired wallets without writing', async () => {
  for (const overrides of [
    { definition: { kind: 'PERSONAL', isActive: true } },
    { isActive: false },
    { expiresAt: new Date('2000-01-01') },
    { definition: { kind: 'CREDIT', isActive: false } },
  ]) {
    const tx = {
      walletAllocation: {
        findUnique: async () => ({
          isActive: true,
          definition: { kind: 'CREDIT', isActive: true },
          expiresAt: new Date('2100-01-01'),
          ...overrides,
        }),
      },
    };
    const prisma = {
      $transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
        run(tx),
    };
    await assert.rejects(
      new AdminEmployeesService(
        prisma as unknown as PrismaService,
      ).topUpAllocation('id', 10),
    );
  }
});

test('individual and bulk allocation helper adds to existing credit or records initial charge', async () => {
  const { creditAllocation } =
    await import('../src/app/admin/credit-allocation');
  for (const exists of [true, false]) {
    let credit = exists ? 1000n : 0n;
    const events: Array<{ data: { type: string; amount: bigint } }> = [];
    const tx = {
      $queryRaw: async () => [],
      walletAllocation: {
        findFirst: async () =>
          exists ? { id: 'allocation-1', spent: 800n } : null,
        update: async ({ data }: { data: { cap: { increment: bigint } } }) => {
          credit += data.cap.increment;
          return { id: 'allocation-1', cap: credit };
        },
        create: async ({ data }: { data: { cap: bigint } }) => {
          credit = data.cap;
          return { id: 'allocation-1', cap: credit };
        },
      },
      transaction: {
        create: async (event: (typeof events)[number]) => events.push(event),
      },
    };
    const result = await creditAllocation(
      tx as never,
      current.id,
      'wallet-1',
      50n,
      new Date('2100-01-01'),
    );
    assert.equal(result.created, !exists);
    assert.equal(credit, exists ? 1050n : 50n);
    assert.equal(events[0].data.amount, 50n);
    assert.equal(events[0].data.type, 'TOPUP');
  }
});

test('wallet history is employee-scoped, hides personal funds and paginates credits and debits', async () => {
  const { ProfileService } = await import('../src/app/profile/profile.service');
  const types = [
    'TOPUP',
    'PURCHASE',
    'REFUND',
    'ADJUSTMENT',
    'WITHDRAWAL',
  ] as const;
  const rows = Array.from({ length: 31 }, (_, index) => ({
    id: String(index),
    allocationId: 'wallet-1',
    type: types[index % types.length],
    amount: 100n,
    createdAt: new Date('2026-10-25T08:00:00Z'),
    note: null,
    store: null,
    allocation: { definition: { name: 'ارزاق' } },
  }));
  const prisma = {
    transaction: {
      findMany: async (query: Record<string, unknown>) => {
        assert.deepEqual(query.where, {
          employeeId: current.id,
          allocation: { definition: { kind: { not: 'PERSONAL' } } },
        });
        assert.deepEqual(query.cursor, { id: 'previous-page' });
        assert.equal(query.skip, 1);
        assert.equal(query.take, 31);
        return rows;
      },
    },
  };
  const page = await new ProfileService(
    prisma as unknown as PrismaService,
  ).walletTransactions(current.id, 'previous-page');
  assert.equal(page.items.length, 30);
  assert.equal(page.nextCursor, '29');
  assert.deepEqual(
    page.items.slice(0, 5).map((item) => item.direction),
    ['credit', 'debit', 'credit', 'debit', 'debit'],
  );
  assert.equal(page.items[0].amount, 100);
  assert.equal(page.items[0].walletName, 'ارزاق');
});

@AdminAccess('employees')
class RestrictedEmployees {
  read() {
    return true;
  }
  write() {
    return true;
  }
  @Roles('SUPER_ADMIN')
  superOnly() {
    return true;
  }
}

function permissionGuard(
  options: {
    permissions?: string[];
    role?: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
    active?: boolean;
    method?: string;
    handler?: 'read' | 'write' | 'superOnly';
  } = {},
) {
  const row = {
    id: 'test-admin',
    role: options.role ?? 'ADMIN',
    permissions: options.permissions ?? [],
    isActive: options.active ?? true,
  };
  const prisma = { admin: { findUnique: async () => row } };
  const jwt = {
    verifyAsync: async () => ({
      sub: row.id,
      role: 'admin',
      scope: 'SUPER_ADMIN',
    }),
  };
  const request = {
    method: options.method ?? 'GET',
    headers: { authorization: 'Bearer test' },
  };
  const context = {
    getHandler: () => RestrictedEmployees.prototype[options.handler ?? 'read'],
    getClass: () => RestrictedEmployees,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return {
    row,
    run: () =>
      new AdminJwtGuard(
        jwt as unknown as JwtService,
        new Reflector(),
        prisma as unknown as PrismaService,
      ).canActivate(context),
  };
}

test('restricted admin can read only granted resources; missing and write grants are denied', async () => {
  assert.equal(
    await permissionGuard({ permissions: ['employees:read'] }).run(),
    true,
  );
  await assert.rejects(permissionGuard().run(), ForbiddenException);
  await assert.rejects(
    permissionGuard({ permissions: ['stores:read'] }).run(),
    ForbiddenException,
  );
  await assert.rejects(
    permissionGuard({ permissions: ['employees:read'], method: 'POST' }).run(),
    ForbiddenException,
  );
  assert.equal(
    await permissionGuard({
      permissions: ['employees:read', 'employees:write'],
      method: 'PATCH',
    }).run(),
    true,
  );
});

test('revoked grants, roles and disabled accounts apply to an already-issued JWT', async () => {
  const guard = permissionGuard({ permissions: ['employees:read'] });
  assert.equal(await guard.run(), true);
  guard.row.permissions = [];
  await assert.rejects(guard.run(), ForbiddenException);
  await assert.rejects(
    permissionGuard({ handler: 'superOnly' }).run(),
    ForbiddenException,
  );
  await assert.rejects(
    permissionGuard({ active: false }).run(),
    UnauthorizedException,
  );
});

test('viewer cannot write; super admin retains full access', async () => {
  assert.equal(await permissionGuard({ role: 'VIEWER' }).run(), true);
  await assert.rejects(
    permissionGuard({ role: 'VIEWER', method: 'DELETE' }).run(),
    ForbiddenException,
  );
  assert.equal(
    await permissionGuard({ role: 'SUPER_ADMIN', method: 'DELETE' }).run(),
    true,
  );
});

test('permission DTOs reject invented grants and accept explicit empty grants', async () => {
  const dto = Object.assign(new UpdateAdminDto(), {
    permissions: ['admins:write'],
  });
  assert.ok(
    (await validate(dto)).some((error) => error.property === 'permissions'),
  );
  Object.assign(dto, { permissions: null });
  assert.ok(
    (await validate(dto)).some((error) => error.property === 'permissions'),
  );
  dto.permissions = [];
  assert.deepEqual(await validate(dto), []);
  assert.deepEqual(normalizeAdminPermissions(['employees:write']), [
    'employees:read',
    'employees:write',
  ]);
  const create = Object.assign(new CreateAdminDto(), {
    username: 'test-user',
    name: 'Test',
    password: 'test-password',
    role: 'ADMIN',
    permissions: [],
  });
  assert.deepEqual(await validate(create), []);
});

test('resetting a dashboard password replaces the hash and preserves exact password whitespace', async () => {
  const row = {
    id: 'test-admin',
    username: 'test-user',
    name: 'Test',
    role: 'ADMIN',
    permissions: [] as AdminPermission[],
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    passwordHash: await bcrypt.hash('old-password', 4),
  };
  const prisma = {
    admin: {
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) =>
        Object.assign(row, data),
    },
  };
  const auth = new AdminAuthService(
    prisma as unknown as PrismaService,
    { signAsync: async () => 'signed-test-token' } as unknown as JwtService,
  );
  const exactPassword = ' new-password ';
  await auth.resetPassword(row.id, exactPassword);
  await assert.rejects(
    auth.login(row.username, 'old-password'),
    UnauthorizedException,
  );
  await assert.rejects(
    auth.login(row.username, exactPassword.trim()),
    UnauthorizedException,
  );
  assert.equal(
    (await auth.login(row.username, exactPassword)).accessToken,
    'signed-test-token',
  );
});

import { PATH_METADATA } from '@nestjs/common/constants';
import * as dashboardControllers from '../src/app/admin/admin.controller';
import { SettlementsController } from '../src/app/settlements/settlements.controller';
import { UpgAdminController } from '../src/app/upg/admin/upg-admin.controller';
import {
  ADMIN_RESOURCE,
  ADMIN_REQUIRED_PERMISSIONS,
} from '../src/app/admin/permissions.decorator';

test('every protected dashboard feature endpoint declares a resource or explicit permission', () => {
  const controllers = [
    dashboardControllers.AdminCompaniesController,
    dashboardControllers.AdminEmployeesController,
    dashboardControllers.AdminAllocationsController,
    dashboardControllers.AdminStoresController,
    dashboardControllers.AdminWalletsController,
    dashboardControllers.AdminReportsController,
    SettlementsController,
    UpgAdminController,
  ];
  const reflector = new Reflector();
  for (const controller of controllers) {
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      if (name === 'constructor') continue;
      const handler =
        controller.prototype[name as keyof typeof controller.prototype];
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
      const targets = [handler, controller];
      assert.ok(
        reflector.getAllAndOverride(ADMIN_RESOURCE, targets) ||
          reflector.getAllAndOverride(ADMIN_REQUIRED_PERMISSIONS, targets),
        `${controller.name}.${name}`,
      );
    }
  }
});

test('super admin is hidden from dashboard user management and cannot be changed from it', async () => {
  const hash = await bcrypt.hash('old-password', 4);
  const rows = [
    { id: 'super', username: 'root', role: 'SUPER_ADMIN' },
    { id: 'admin', username: 'staff', role: 'ADMIN' },
  ].map((row) => ({
    ...row,
    name: row.username,
    permissions: [] as AdminPermission[],
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    passwordHash: hash,
  }));
  const writes: string[] = [];
  const prisma = {
    admin: {
      findMany: async ({ where }: { where: { role: { not: string } } }) =>
        rows.filter((row) => row.role !== where.role.not),
      findUnique: async ({ where }: { where: { id: string } }) =>
        rows.find((row) => row.id === where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: object;
      }) => {
        writes.push(where.id);
        const row = rows.find((candidate) => candidate.id === where.id);
        assert.ok(row);
        return Object.assign(row, data);
      },
      create: async () => assert.fail('must not create a super admin'),
    },
  };
  const auth = new AdminAuthService(
    prisma as unknown as PrismaService,
    {} as unknown as JwtService,
  );

  assert.deepEqual(
    (await auth.list()).map((row) => row.username),
    ['staff'],
  );
  await assert.rejects(
    auth.update('super', { isActive: false }),
    NotFoundException,
  );
  await assert.rejects(
    auth.update('super', { role: 'VIEWER' }),
    NotFoundException,
  );
  await assert.rejects(
    auth.resetPassword('super', 'new-password'),
    NotFoundException,
  );
  await assert.rejects(
    auth.update('admin', { role: 'SUPER_ADMIN' }),
    BadRequestException,
  );
  await assert.rejects(
    auth.create({
      username: 'x',
      name: 'x',
      password: 'password1',
      role: 'SUPER_ADMIN',
    }),
    BadRequestException,
  );
  assert.deepEqual(writes, []);
  assert.equal(rows[0].isActive, true);

  await auth.update('admin', { isActive: false });
  assert.deepEqual(writes, ['admin']);

  for (const Dto of [CreateAdminDto, UpdateAdminDto]) {
    const dto = Object.assign(new Dto(), { role: 'SUPER_ADMIN' });
    assert.ok((await validate(dto)).some((error) => error.property === 'role'));
  }
});
