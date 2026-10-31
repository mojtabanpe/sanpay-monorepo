import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/app/prisma/prisma.service';
import { SmsService } from '../src/app/auth/sms.service';
import {
  StorePasswordService,
  maskPhone,
  normalizeMobile,
} from '../src/app/store/store-password.service';
import { StoreJwtGuard } from '../src/app/store/store-jwt.guard';
import { AdminStoresService } from '../src/app/admin/admin-stores.service';

const INITIAL = 'given-by-admin';

async function fixture(
  run: (f: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
  phone: string | null = '۰۹۱۲ ۳۴۵ ۶۷۸۹',
) {
  const f = await createFixture(phone);
  try {
    await run(f);
  } finally {
    await f.prisma.store.delete({ where: { id: f.store.id } });
    await f.prisma.$disconnect();
  }
}

async function createFixture(phone: string | null) {
  const database = new URL(process.env.DATABASE_URL || 'http://missing');
  assert.ok(
    ['localhost', '127.0.0.1'].includes(database.hostname),
    'Store-password integration tests require a local database',
  );
  process.env.OTP_SECRET ||= 'test-otp-secret';
  const prisma = new PrismaService();
  await prisma.$connect();
  const suffix = randomUUID().slice(0, 8);
  const store = await prisma.store.create({
    data: {
      name: 'فروشگاه تست رمز',
      code: `T${suffix.toUpperCase()}`,
      username: `pw-test-${suffix}`,
      passwordHash: await bcrypt.hash(INITIAL, 4),
      phone,
    },
  });
  const sent: { phone: string; code: string }[] = [];
  const failure = { sms: false };
  const sms = {
    sendStorePasswordOtp: async (to: string, code: string) => {
      if (failure.sms) throw new Error('SMS unavailable');
      sent.push({ phone: to, code });
    },
  } as unknown as SmsService;
  const service = new StorePasswordService(prisma, sms);
  const reload = () =>
    prisma.store.findUniqueOrThrow({ where: { id: store.id } });
  const passwordIs = async (password: string) =>
    bcrypt.compare(password, (await reload()).passwordHash);
  const expireResendWindow = () =>
    prisma.storePasswordOtp.update({
      where: { storeId: store.id },
      data: { sentAt: new Date(Date.now() - 61_000) },
    });
  return {
    prisma,
    store,
    sent,
    failure,
    service,
    reload,
    passwordIs,
    expireResendWindow,
  };
}

test('normalizes Iranian mobiles and rejects landlines', () => {
  assert.equal(normalizeMobile('09123456789'), '09123456789');
  assert.equal(normalizeMobile('۰۹۱۲-۳۴۵-۶۷۸۹'), '09123456789');
  assert.equal(normalizeMobile('+98 912 345 6789'), '09123456789');
  assert.equal(normalizeMobile('00989123456789'), '09123456789');
  assert.equal(normalizeMobile('9123456789'), '09123456789');
  assert.equal(normalizeMobile('034-42251234'), null);
  assert.equal(normalizeMobile(null), null);
  assert.equal(maskPhone('09123456789'), '0912***6789');
});

test('first change uses the admin-given password, then requires SMS', async () => {
  await fixture(async (f) => {
    await assert.rejects(
      f.service.changeWithPassword(f.store.id, 'wrong', 'new-password-1'),
      /رمز عبور فعلی نادرست است/,
    );
    await assert.rejects(
      f.service.changeWithPassword(f.store.id, INITIAL, INITIAL),
      /نباید با رمز فعلی یکی باشد/,
    );
    await assert.rejects(
      f.service.requestOtp(f.store.id),
      /اولین تغییر رمز/,
      'OTP is not offered while the admin-given password is still in use',
    );

    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');
    const changed = await f.reload();
    assert.ok(changed.passwordChangedAt);
    assert.ok(changed.sessionsValidAfter);
    assert.ok(await f.passwordIs('new-password-1'));

    await assert.rejects(
      f.service.changeWithPassword(
        f.store.id,
        'new-password-1',
        'new-password-2',
      ),
      /کد تأیید پیامکی/,
    );
    assert.ok(await f.passwordIs('new-password-1'));
  });
});

test('later changes need the SMS code sent to the store mobile', async () => {
  await fixture(async (f) => {
    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');

    const challenge = await f.service.requestOtp(f.store.id);
    assert.equal(challenge.phone, '0912***6789');
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0].phone, '09123456789');
    await assert.rejects(f.service.requestOtp(f.store.id), /یک دقیقه صبر/);

    const wrong = f.sent[0].code === '000000' ? '111111' : '000000';
    await assert.rejects(
      f.service.changeWithOtp(f.store.id, wrong, 'new-password-2'),
      /کد تأیید نامعتبر/,
    );
    const otp = await f.prisma.storePasswordOtp.findUniqueOrThrow({
      where: { storeId: f.store.id },
    });
    assert.equal(otp.attempts, 1, 'failed attempt is committed');

    await assert.rejects(
      f.service.changeWithOtp(f.store.id, f.sent[0].code, 'new-password-1'),
      /نباید با رمز فعلی یکی باشد/,
    );
    await f.service.changeWithOtp(f.store.id, f.sent[0].code, 'new-password-2');
    assert.ok(await f.passwordIs('new-password-2'));
    await assert.rejects(
      f.service.changeWithOtp(f.store.id, f.sent[0].code, 'new-password-3'),
      /کد تأیید نامعتبر/,
      'a code is single-use',
    );
  });
});

test('locks the code after five wrong attempts and on expiry', async () => {
  await fixture(async (f) => {
    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');
    await f.service.requestOtp(f.store.id);
    const code = f.sent[0].code;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        f.service.changeWithOtp(f.store.id, wrong, 'new-password-2'),
      );
    }
    await assert.rejects(
      f.service.changeWithOtp(f.store.id, code, 'new-password-2'),
      /کد تأیید نامعتبر/,
    );

    await f.expireResendWindow();
    await f.service.requestOtp(f.store.id);
    await f.prisma.storePasswordOtp.update({
      where: { storeId: f.store.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await assert.rejects(
      f.service.changeWithOtp(f.store.id, f.sent[1].code, 'new-password-2'),
      /کد تأیید نامعتبر/,
    );
    assert.ok(await f.passwordIs('new-password-1'));
  });
});

test('a code dies when the store phone changes; a failed SMS can be retried at once', async () => {
  await fixture(async (f) => {
    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');
    await f.service.requestOtp(f.store.id);
    await f.prisma.store.update({
      where: { id: f.store.id },
      data: { phone: '09350000000' },
    });
    await assert.rejects(
      f.service.changeWithOtp(f.store.id, f.sent[0].code, 'new-password-2'),
      /کد تأیید نامعتبر/,
    );

    await f.expireResendWindow();
    f.failure.sms = true;
    await assert.rejects(f.service.requestOtp(f.store.id), /SMS unavailable/);
    f.failure.sms = false;
    await f.service.requestOtp(f.store.id);
    assert.equal(f.sent.at(-1)?.phone, '09350000000');
  });
});

test('refuses to send a code without a mobile number', async () => {
  await fixture(async (f) => {
    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');
    await assert.rejects(
      f.service.requestOtp(f.store.id),
      /شماره موبایل فروشگاه ثبت نشده/,
    );
    assert.equal(f.sent.length, 0);
  }, '034-42251234');
});

test('tokens issued before a password change are rejected', async () => {
  await fixture(async (f) => {
    const jwt = new JwtService({ secret: 'store-password-test' });
    const guard = new StoreJwtGuard(jwt, f.prisma);
    const contextFor = (token: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
        }),
      }) as unknown as ExecutionContext;
    const payload = {
      sub: f.store.id,
      username: f.store.username,
      role: 'store',
    };
    const old = await jwt.signAsync({
      ...payload,
      iat: Math.floor(Date.now() / 1000) - 60,
    });
    assert.equal(await guard.canActivate(contextFor(old)), true);

    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');
    await assert.rejects(guard.canActivate(contextFor(old)));
    const fresh = await jwt.signAsync(payload);
    assert.equal(await guard.canActivate(contextFor(fresh)), true);
  });
});

test('an admin reset brings back the current-password flow', async () => {
  await fixture(async (f) => {
    await f.service.changeWithPassword(f.store.id, INITIAL, 'new-password-1');
    await f.service.requestOtp(f.store.id);

    const admin = new AdminStoresService(f.prisma);
    await admin.resetPassword(f.store.id, 'admin-reset-1');
    const reset = await f.reload();
    assert.equal(reset.passwordChangedAt, null);
    assert.equal(
      await f.prisma.storePasswordOtp.count({ where: { storeId: f.store.id } }),
      0,
    );
    await f.service.changeWithPassword(
      f.store.id,
      'admin-reset-1',
      'new-password-2',
    );
    assert.ok(await f.passwordIs('new-password-2'));
  });
});
