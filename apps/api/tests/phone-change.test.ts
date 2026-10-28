import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { validate } from 'class-validator';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { PhoneChangeService } from '../src/app/auth/phone-change.service';
import { SmsService } from '../src/app/auth/sms.service';
import { UpdateProfileDto } from '../src/app/auth/dto/update-profile.dto';

const phone = () => `09${String(randomInt(0, 1_000_000_000)).padStart(9, '0')}`;

async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for outbox');
}

async function fixture(
  run: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
) {
  const f = await createFixture();
  try {
    await run(f);
  } finally {
    await until(
      async () =>
        (await f.prisma.employeePhoneChange.count({
          where: {
            employeeId: { in: [f.first.id, f.second.id] },
            noticeLockedUntil: { gt: new Date() },
          },
        })) === 0,
    );
    await f.prisma.employee.deleteMany({ where: { companyId: f.company.id } });
    await f.prisma.company.delete({ where: { id: f.company.id } });
    await f.prisma.$disconnect();
  }
}

async function createFixture() {
  const database = new URL(process.env.DATABASE_URL || 'http://missing');
  assert.ok(
    ['localhost', '127.0.0.1'].includes(database.hostname),
    'Phone-change integration tests require a local database',
  );
  const prisma = new PrismaService();
  await prisma.$connect();
  const company = await prisma.company.create({
    data: { name: `phone-change-test-${randomUUID()}` },
  });
  const createEmployee = (code: string) =>
    prisma.employee.create({
      data: {
        companyId: company.id,
        nationalCode: code,
        personnelCode: code,
        firstName: 'تست',
        lastName: 'تغییر شماره',
        organizationalRank: 'EMPLOYEE',
        phone: phone(),
      },
    });
  const first = await createEmployee('0099999901');
  const second = await createEmployee('0099999902');
  const otps: { phone: string; code: string; newPhone: string }[] = [];
  const notices: { phone: string; oldPhone: string; newPhone: string }[] = [];
  const failure = { otp: false, noticePhone: '' };
  const sms = {
    sendPhoneChangeOtp: async (to: string, code: string, newPhone: string) => {
      if (failure.otp) throw new Error('SMS unavailable');
      otps.push({ phone: to, code, newPhone });
    },
    sendPhoneChangeNotice: async (
      to: string,
      oldPhone: string,
      newPhone: string,
    ) => {
      notices.push({ phone: to, oldPhone, newPhone });
      if (failure.noticePhone === to) throw new Error('SMS unavailable');
    },
  };
  const service = new PhoneChangeService(prisma, sms as unknown as SmsService);
  return { prisma, service, company, first, second, otps, notices, failure };
}

test('phone-change API requires a challenge and a six-digit code; the old one-step payload is rejected', async () => {
  const missing = Object.assign(new UpdateProfileDto(), {
    phone: '09123456789',
  });
  const errors = await validate(missing);
  assert.ok(errors.some((e) => e.property === 'code'));
  assert.ok(errors.some((e) => e.property === 'requestId'));
  const valid = Object.assign(new UpdateProfileDto(), {
    phone: '09123456789',
    code: '123456',
    requestId: randomUUID(),
  });
  assert.deepEqual(await validate(valid), []);
  valid.phone = '';
  assert.ok((await validate(valid)).some((e) => e.property === 'phone'));
});

test('duplicate, unchanged and missing old phones are rejected before sending an OTP', async () =>
  fixture(async (f) => {
    await f.prisma.employee.update({
      where: { id: f.second.id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await assert.rejects(
      f.service.request(f.first.id, f.second.phone!),
      /قبلاً/,
    );
    await assert.rejects(
      f.service.request(f.first.id, f.first.phone!),
      /یکسان/,
    );
    await f.prisma.employee.update({
      where: { id: f.first.id },
      data: { phone: null },
    });
    await assert.rejects(f.service.request(f.first.id, phone()), /پشتیبانی/);
    assert.equal(f.otps.length, 0);
  }));

test('request sends only to the old phone, stores only a bound hash, and preserves the current phone', async () =>
  fixture(async (f) => {
    const next = phone();
    const challenge = await f.service.request(f.first.id, next);
    assert.equal(f.otps[0].phone, f.first.phone);
    assert.equal(f.otps[0].newPhone, next);
    assert.match(f.otps[0].code, /^\d{6}$/);
    assert.equal('code' in challenge, false);
    const stored = await f.prisma.employeePhoneChange.findUniqueOrThrow({
      where: { id: challenge.requestId },
    });
    assert.match(stored.codeHash, /^[a-f0-9]{64}$/);
    assert.notEqual(stored.codeHash, f.otps[0].code);
    assert.equal(
      (await f.prisma.employee.findUniqueOrThrow({ where: { id: f.first.id } }))
        .phone,
      f.first.phone,
    );
    assert.equal(f.notices.length, 0);
  }));

test('simultaneous OTP requests are serialized and only one SMS is sent during the cooldown', async () =>
  fixture(async (f) => {
    const next = phone();
    const results = await Promise.allSettled([
      f.service.request(f.first.id, next),
      f.service.request(f.first.id, next),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(f.otps.length, 1);
  }));

test('five wrong attempts persist, and a correct code is blocked after the attempt limit', async () =>
  fixture(async (f) => {
    const next = phone();
    const challenge = await f.service.request(f.first.id, next);
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        f.service.confirm(f.first.id, {
          phone: next,
          requestId: challenge.requestId,
          code: '000000',
        }),
        /نامعتبر/,
      );
    }
    assert.equal(
      (
        await f.prisma.employeePhoneChange.findUniqueOrThrow({
          where: { id: challenge.requestId },
        })
      ).attempts,
      5,
    );
    await assert.rejects(
      f.service.confirm(f.first.id, {
        phone: next,
        requestId: challenge.requestId,
        code: f.otps[0].code,
      }),
      /نامعتبر/,
    );
    assert.equal(
      (await f.prisma.employee.findUniqueOrThrow({ where: { id: f.first.id } }))
        .phone,
      f.first.phone,
    );
  }));

test('codes cannot be used for another employee, target number, expired challenge, or an invalidated challenge', async () =>
  fixture(async (f) => {
    const next = phone();
    const challenge = await f.service.request(f.first.id, next);
    const input = {
      phone: next,
      requestId: challenge.requestId,
      code: f.otps[0].code,
    };
    await assert.rejects(f.service.confirm(f.second.id, input), /نامعتبر/);
    await assert.rejects(
      f.service.confirm(f.first.id, { ...input, phone: phone() }),
      /نامعتبر/,
    );
    await f.prisma.employeePhoneChange.update({
      where: { id: challenge.requestId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await assert.rejects(f.service.confirm(f.first.id, input), /نامعتبر/);
    await f.prisma.employeePhoneChange.update({
      where: { id: challenge.requestId },
      data: {
        expiresAt: new Date(Date.now() + 120_000),
        sentAt: new Date(Date.now() - 61_000),
      },
    });
    await f.service.request(f.first.id, next);
    await assert.rejects(f.service.confirm(f.first.id, input), /نامعتبر/);
  }));

test('a number claimed while the OTP is pending is rejected again during final confirmation', async () =>
  fixture(async (f) => {
    const next = phone();
    const challenge = await f.service.request(f.first.id, next);
    await f.prisma.employee.update({
      where: { id: f.second.id },
      data: { phone: next },
    });
    await assert.rejects(
      f.service.confirm(f.first.id, {
        phone: next,
        requestId: challenge.requestId,
        code: f.otps[0].code,
      }),
      /قبلاً/,
    );
    assert.equal(
      (await f.prisma.employee.findUniqueOrThrow({ where: { id: f.first.id } }))
        .phone,
      f.first.phone,
    );
    assert.equal(f.notices.length, 0);
  }));

test('simultaneous confirmations for the same new phone cannot bypass the database unique constraint', async () =>
  fixture(async (f) => {
    const next = phone();
    const one = await f.service.request(f.first.id, next);
    const two = await f.service.request(f.second.id, next);
    const results = await Promise.allSettled([
      f.service.confirm(f.first.id, {
        phone: next,
        requestId: one.requestId,
        code: f.otps[0].code,
      }),
      f.service.confirm(f.second.id, {
        phone: next,
        requestId: two.requestId,
        code: f.otps[1].code,
      }),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected');
    assert.ok(
      rejected?.status === 'rejected' && /قبلاً/.test(rejected.reason.message),
    );
    assert.equal(await f.prisma.employee.count({ where: { phone: next } }), 1);
  }));

test('successful confirmation is single-use, keeps identity and sessions, clears login OTP, and notifies both phones', async () =>
  fixture(async (f) => {
    const next = phone();
    await f.prisma.employeeSession.create({
      data: {
        employeeId: f.first.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await f.prisma.employeeOtp.create({
      data: {
        employeeId: f.first.id,
        codeHash: 'old-login-hash',
        expiresAt: new Date(Date.now() + 120_000),
      },
    });
    const challenge = await f.service.request(f.first.id, next);
    const input = {
      phone: next,
      requestId: challenge.requestId,
      code: f.otps[0].code,
    };
    await f.service.confirm(f.first.id, input);
    const employee = await f.prisma.employee.findUniqueOrThrow({
      where: { id: f.first.id },
      include: { sessions: true, otp: true },
    });
    assert.equal(employee.phone, next);
    assert.equal(employee.id, f.first.id);
    assert.equal(employee.nationalCode, f.first.nationalCode);
    assert.equal(employee.sessions.length, 1);
    assert.equal(employee.otp, null);
    await assert.rejects(f.service.confirm(f.first.id, input), /نامعتبر/);
    await until(async () => {
      const row = await f.prisma.employeePhoneChange.findUniqueOrThrow({
        where: { id: challenge.requestId },
      });
      return !!row.oldNoticeSentAt && !!row.newNoticeSentAt;
    });
    assert.deepEqual(
      f.notices.map((n) => n.phone).sort(),
      [f.first.phone, next].sort(),
    );
  }));

test('notification failures do not undo the phone change and durable retry does not resend the accepted old-phone notice', async () =>
  fixture(async (f) => {
    const next = phone();
    f.failure.noticePhone = next;
    const challenge = await f.service.request(f.first.id, next);
    await f.service.confirm(f.first.id, {
      phone: next,
      requestId: challenge.requestId,
      code: f.otps[0].code,
    });
    await until(async () => {
      const row = await f.prisma.employeePhoneChange.findUniqueOrThrow({
        where: { id: challenge.requestId },
      });
      return (
        !!row.oldNoticeSentAt &&
        !row.newNoticeSentAt &&
        row.noticeAttempts > 0 &&
        !row.noticeLockedUntil
      );
    });
    assert.equal(
      (await f.prisma.employee.findUniqueOrThrow({ where: { id: f.first.id } }))
        .phone,
      next,
    );
    f.failure.noticePhone = '';
    await f.prisma.employeePhoneChange.update({
      where: { id: challenge.requestId },
      data: { nextNoticeAttemptAt: new Date() },
    });
    await Promise.all([
      f.service.deliverNotice(challenge.requestId),
      f.service.deliverNotice(challenge.requestId),
    ]);
    const stored = await f.prisma.employeePhoneChange.findUniqueOrThrow({
      where: { id: challenge.requestId },
    });
    assert.ok(stored.newNoticeSentAt);
    assert.equal(f.notices.filter((n) => n.phone === f.first.phone).length, 1);
    assert.equal(f.notices.filter((n) => n.phone === next).length, 2);
  }));

test('failed OTP delivery invalidates its challenge without changing the phone', async () =>
  fixture(async (f) => {
    f.failure.otp = true;
    await assert.rejects(
      f.service.request(f.first.id, phone()),
      /SMS unavailable/,
    );
    const row = await f.prisma.employeePhoneChange.findFirstOrThrow({
      where: { employeeId: f.first.id },
    });
    assert.ok(row.invalidatedAt);
    assert.equal(
      (await f.prisma.employee.findUniqueOrThrow({ where: { id: f.first.id } }))
        .phone,
      f.first.phone,
    );
  }));

test('SMS.ir phone-change templates receive the exact named parameters without sending real SMS', async (t) => {
  const names = [
    'SMS_MODE',
    'SMSIR_API_KEY',
    'SMSIR_PHONE_CHANGE_OTP_TEMPLATE_ID',
    'SMSIR_PHONE_CHANGE_NOTICE_TEMPLATE_ID',
  ];
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, {
    SMS_MODE: 'smsir',
    SMSIR_API_KEY: 'fake-test-key',
    SMSIR_PHONE_CHANGE_OTP_TEMPLATE_ID: '111',
    SMSIR_PHONE_CHANGE_NOTICE_TEMPLATE_ID: '222',
  });
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  const bodies: {
    mobile: string;
    templateId: number;
    parameters: { name: string; value: string }[];
  }[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return { ok: true, status: 200, json: async () => ({ status: 1 }) };
    },
  );
  const sms = new SmsService();
  await sms.sendPhoneChangeOtp('09123456789', '123456', '09901234567');
  await sms.sendPhoneChangeNotice(
    '09901234567',
    '09123456789',
    '09901234567',
    new Date('2026-10-28T10:00:00Z'),
  );
  assert.deepEqual(bodies[0], {
    mobile: '09123456789',
    templateId: 111,
    parameters: [
      { name: 'CODE', value: '123456' },
      { name: 'NEWPHONE', value: '09901234567' },
    ],
  });
  assert.equal(bodies[1].templateId, 222);
  assert.equal(bodies[1].mobile, '09901234567');
  assert.deepEqual(
    bodies[1].parameters.map((p) => p.name),
    ['OLDPHONE', 'NEWPHONE', 'TIME'],
  );
  assert.match(bodies[1].parameters[2].value, /1405\/08\/06 ساعت 13:30/);
});
