import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHmac } from 'node:crypto';
import { AuthService, JwtPayload } from '../src/app/auth/auth.service';
import { JwtAuthGuard } from '../src/app/auth/jwt-auth.guard';
import { deviceLabel } from '../src/app/auth/session-info';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { SmsService } from '../src/app/auth/sms.service';

type Session = {
  id: string;
  employeeId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};
const password = 'Password123!';
const hash = bcrypt.hashSync(password, 4);
const info = {
  userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Safari/537.36',
  ipAddress: '192.0.2.1',
};

function fixture() {
  const rows: Session[] = [];
  const employee = {
    id: 'employee-1',
    nationalCode: '0012345678',
    phone: '09123456789',
    passwordHash: hash as string | null,
    isActive: true,
    deletedAt: null,
    firstName: 'علی',
    lastName: 'رضایی',
    personnelCode: 'P1',
    organizationalRank: 'EMPLOYEE',
    company: { id: 'company-1', name: 'شرکت', isActive: true },
  };
  const matches = (session: Session, where: any) =>
    session.employeeId === where.employeeId &&
    (typeof where.id === 'string'
      ? session.id === where.id
      : !where.id || session.id !== where.id.not) &&
    (where.revokedAt !== null || !session.revokedAt) &&
    (!where.expiresAt?.gt || session.expiresAt > where.expiresAt.gt) &&
    (!where.lastSeenAt?.lt || session.lastSeenAt < where.lastSeenAt.lt);
  const prisma = {
    employee: {
      findFirst: async ({ where }: any) => {
        if (where.phone)
          return where.phone === employee.phone ? employee : null;
        assert.equal(where.isActive, true);
        assert.equal(where.deletedAt, null);
        assert.deepEqual(where.company, { isActive: true });
        const session = where.sessions.some;
        assert.equal(session.revokedAt, null);
        return rows.some((row) =>
          matches(row, { ...session, employeeId: where.id }),
        )
          ? employee
          : null;
      },
      findUnique: async () => employee,
      update: async ({ data }: any) => Object.assign(employee, data),
    },
    employeeOtp: { delete: async () => ({}) },
    employeeSession: {
      create: async ({
        data,
      }: {
        data: Omit<Session, 'createdAt' | 'lastSeenAt' | 'revokedAt'>;
      }) => {
        const session = {
          ...data,
          createdAt: new Date(),
          lastSeenAt: new Date(),
          revokedAt: null,
        };
        rows.push(session);
        return session;
      },
      findMany: async ({ where }: any) =>
        rows.filter((row) => matches(row, where)),
      updateMany: async ({ where, data }: any) => {
        const selected = rows.filter((row) => matches(row, where));
        selected.forEach((row) => Object.assign(row, data));
        return { count: selected.length };
      },
    },
  };
  const jwt = new JwtService({ secret: 'session-test-secret' });
  const service = new AuthService(prisma as unknown as PrismaService, jwt, {
    sendLoginNotice: () => undefined,
  } as unknown as SmsService);
  const guard = new JwtAuthGuard(jwt, prisma as unknown as PrismaService);
  const authorize = (token: string, url = '/api/auth/me') =>
    guard.canActivate({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: `Bearer ${token}` },
          url,
        }),
      }),
    } as ExecutionContext);
  const login = () => service.login(employee.phone, password, info);
  const decode = (token: string) => jwt.decode<JwtPayload>(token);
  return { rows, employee, prisma, service, jwt, authorize, login, decode };
}

test('each password login has a unique revocable session and expiring JWT', async () => {
  const f = fixture();
  const first = await f.login();
  const second = await f.login();
  assert.notEqual(first.accessToken, second.accessToken);
  assert.notEqual(
    f.decode(first.accessToken).sid,
    f.decode(second.accessToken).sid,
  );
  assert.equal(f.rows.length, 2);
  assert.equal(f.rows[0].userAgent, info.userAgent);
  assert.equal(f.rows[0].ipAddress, info.ipAddress);
  assert.ok(f.decode(first.accessToken).exp! > Date.now() / 1000);
  assert.equal(await f.authorize(first.accessToken), true);
});

test('revoking one device blocks replay of its JWT while other devices keep working', async () => {
  const f = fixture();
  const first = await f.login();
  const second = await f.login();
  await f.service.revokeSession(
    f.decode(first.accessToken),
    f.decode(second.accessToken).sid,
  );
  await assert.rejects(f.authorize(second.accessToken), UnauthorizedException);
  assert.equal(await f.authorize(first.accessToken), true);
});

test('revoke others preserves current session and other employees', async () => {
  const f = fixture();
  const first = await f.login();
  const second = await f.login();
  f.rows.push({
    ...f.rows[1],
    id: 'foreign-session',
    employeeId: 'employee-2',
  });
  await f.service.revokeOtherSessions(f.decode(first.accessToken));
  await assert.rejects(f.authorize(second.accessToken), UnauthorizedException);
  assert.equal(await f.authorize(first.accessToken), true);
  assert.equal(f.rows[2].revokedAt, null);
});

test('session list is scoped, identifies current session and hides revoked or expired sessions', async () => {
  const f = fixture();
  const first = await f.login();
  f.rows.push({
    ...f.rows[0],
    id: 'foreign-session',
    employeeId: 'employee-2',
  });
  f.rows.push({
    ...f.rows[0],
    id: 'expired',
    expiresAt: new Date('2000-01-01'),
  });
  f.rows.push({ ...f.rows[0], id: 'revoked', revokedAt: new Date() });
  const list = await f.service.sessions(f.decode(first.accessToken));
  assert.equal(list.length, 1);
  assert.equal(list[0].isCurrent, true);
  assert.equal(list[0].device, 'Chrome · Android');
  await assert.rejects(
    f.service.revokeSession(f.decode(first.accessToken), 'foreign-session'),
    NotFoundException,
  );
  assert.equal(f.rows[1].revokedAt, null);
});

test('expired sessions and legacy JWTs without session IDs cannot authenticate', async () => {
  const f = fixture();
  const first = await f.login();
  f.rows[0].expiresAt = new Date('2000-01-01');
  await assert.rejects(f.authorize(first.accessToken), UnauthorizedException);
  const { sid, ...legacy } = f.decode(first.accessToken);
  await assert.rejects(
    f.authorize(await f.jwt.signAsync(legacy)),
    UnauthorizedException,
  );
});

test('ordinary logout revokes the current token on the server', async () => {
  const f = fixture();
  const first = await f.login();
  const payload = f.decode(first.accessToken);
  await f.service.revokeSession(payload, payload.sid);
  await assert.rejects(f.authorize(first.accessToken), UnauthorizedException);
});

test('last activity is updated for a stale session', async () => {
  const f = fixture();
  const first = await f.login();
  f.rows[0].lastSeenAt = new Date('2000-01-01');
  await f.authorize(first.accessToken);
  assert.ok(f.rows[0].lastSeenAt.getTime() > Date.now() - 1000);
});

test('OTP login creates a session and initial password completion preserves its identity', async () => {
  const f = fixture();
  const oldSecret = process.env.OTP_SECRET;
  process.env.OTP_SECRET = 'otp-session-test-secret';
  try {
    f.employee.passwordHash = null;
    const code = '123456';
    Object.assign(f.employee, {
      otp: {
        codeHash: createHmac('sha256', process.env.OTP_SECRET)
          .update(`${f.employee.id}:${code}`)
          .digest('hex'),
        expiresAt: new Date(Date.now() + 120_000),
        attempts: 0,
      },
    });
    const response = await f.service.verifyOtp(
      f.employee.nationalCode,
      f.employee.phone,
      code,
      info,
    );
    assert.equal(f.rows.length, 1);
    assert.equal(response.requiresPasswordSetup, true);
    await assert.rejects(
      f.authorize(response.accessToken),
      UnauthorizedException,
    );
    await assert.rejects(
      f.authorize(
        response.accessToken,
        '/api/wallets?next=/auth/set-initial-password',
      ),
      UnauthorizedException,
    );
    assert.equal(
      await f.authorize(response.accessToken, '/api/auth/logout'),
      true,
    );
    const completed = await f.service.setInitialPassword(
      f.decode(response.accessToken),
      password,
    );
    const payload = f.decode(completed.accessToken);
    assert.equal(payload.sid, f.decode(response.accessToken).sid);
    assert.equal(payload.requiresPasswordSetup, false);
    assert.ok(payload.exp! <= f.decode(response.accessToken).exp!);
    assert.equal(await f.authorize(completed.accessToken), true);
    assert.equal(f.rows.length, 1);
  } finally {
    if (oldSecret === undefined) delete process.env.OTP_SECRET;
    else process.env.OTP_SECRET = oldSecret;
  }
});

test('device labels handle Safari, Edge and missing User-Agent', () => {
  assert.equal(deviceLabel(null), 'دستگاه ناشناس');
  assert.equal(deviceLabel('iPhone Version/17 Safari/605.1'), 'Safari · iOS');
  assert.equal(
    deviceLabel('Windows NT Chrome/130 Safari/537 Edg/130'),
    'Edge · Windows',
  );
});
