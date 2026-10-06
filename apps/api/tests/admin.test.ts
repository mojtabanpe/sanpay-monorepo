import 'reflect-metadata';
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

test('profile phone updates reject another employment even with the same national code', async () => {
  let checked: unknown;
  const prisma = {
    employee: {
      findFirst: async ({ where }: { where: unknown }) => {
        checked = where;
        return { id: 'employee-2' };
      },
    },
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {} as JwtService,
    {} as SmsService,
  );
  await assert.rejects(
    service.updatePhone(current.id, current.phone),
    /شماره موبایل/,
  );
  assert.deepEqual(checked, { phone: current.phone, id: { not: current.id } });
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
  };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    {
      signAsync: async (payload: JwtPayload) => JSON.stringify(payload),
    } as unknown as JwtService,
    {} as SmsService,
  );
  const firstResponse = await service.login(first.phone, 'SharedPassword123!');
  assert.equal(firstResponse.employee.id, first.id);
  const response = await service.login(second.phone, 'SharedPassword123!');
  assert.equal(response.employee.id, second.id);
  assert.equal(JSON.parse(response.accessToken).sub, second.id);
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
