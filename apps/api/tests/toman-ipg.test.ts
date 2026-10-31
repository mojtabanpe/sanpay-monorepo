import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  TomanIpgHttpClient,
  parseErrors,
} from '../src/app/upg/gateways/toman/toman-ipg-http.client';
import { TomanIpgMockClient } from '../src/app/upg/gateways/toman/toman-ipg-mock.client';
import { TomanIpgGateway } from '../src/app/upg/gateways/toman/toman-ipg.gateway';

const AUTH_URL = 'https://auth.example.test/oauth2/token/';
const IPG_URL = 'https://ipg.example.test';
const ENV_KEYS = [
  'TOMAN_IPG_URL',
  'TOMAN_IPG_AUTH_URL',
  'TOMAN_IPG_USERNAME',
  'TOMAN_IPG_PASSWORD',
  'TOMAN_IPG_CLIENT_ID',
  'TOMAN_IPG_CLIENT_SECRET',
  'TOMAN_IPG_TERMINAL',
  'UPG_MOCK_REFUND_RESULT',
  'UPG_MOCK_REFUND_WALLET_RIAL',
];

type Handler = (
  url: URL,
  init: RequestInit | undefined,
) => Response | Promise<Response>;

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let calls: { method: string; path: string; body: unknown; scope?: string }[];
let routes: Map<string, Handler>;

function route(method: string, path: string, handler: Handler) {
  routes.set(`${method} ${path}`, handler);
}

const payment = {
  ref: 'pay-uuid',
  trackerId: 'tracker-1',
  amountRial: 120_000,
  createdAt: new Date(),
};

beforeEach(() => {
  calls = [];
  routes = new Map();
  process.env.TOMAN_IPG_URL = IPG_URL;
  process.env.TOMAN_IPG_AUTH_URL = AUTH_URL;
  process.env.TOMAN_IPG_USERNAME = 'user';
  process.env.TOMAN_IPG_PASSWORD = 'pass';
  process.env.TOMAN_IPG_CLIENT_ID = 'client';
  process.env.TOMAN_IPG_CLIENT_SECRET = 'secret';
  delete process.env.TOMAN_IPG_TERMINAL;
  delete process.env.UPG_MOCK_REFUND_RESULT;
  delete process.env.UPG_MOCK_REFUND_WALLET_RIAL;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    if (url.href === AUTH_URL) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get('grant_type'), 'password');
      return Response.json({ access_token: `token:${body.get('scope')}` });
    }
    const method = init?.method ?? 'GET';
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    calls.push({
      method,
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      scope: auth.replace('Bearer token:', ''),
    });
    const handler = routes.get(`${method} ${url.pathname}`);
    if (!handler) return new Response(null, { status: 500 });
    return handler(url, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

const live = () => new TomanIpgGateway(new TomanIpgHttpClient());

test('create sends rial amount, tracker, callback, normalized mobile and terminal', async () => {
  process.env.TOMAN_IPG_TERMINAL = '13268913';
  route('POST', '/payments', () =>
    Response.json({ uuid: 'pay-uuid', tracker_id: 'tracker-1' }),
  );
  const created = await live().create({
    amountRial: 120_000,
    trackerId: 'tracker-1',
    callbackUrl: 'https://app.example.test/api/upg/callback/toman',
    mobile: '+98 912 123 4567',
  });
  assert.equal(created.ref, 'pay-uuid');
  assert.equal(created.redirectUrl, `${IPG_URL}/payments/pay-uuid/redirect`);
  assert.deepEqual(calls[0].body, {
    amount: 120_000,
    callback_url: 'https://app.example.test/api/upg/callback/toman',
    tracker_id: 'tracker-1',
    mobile_number: '09121234567',
    options: { terminal_number: '13268913' },
  });
  assert.equal(calls[0].scope, 'payment.create');
});

test('create failure becomes GatewayUnavailableError for failover', async () => {
  route('POST', '/payments', () =>
    Response.json(
      { non_field_errors: [{ code: 'no_psp_available', detail: 'No PSP' }] },
      { status: 400 },
    ),
  );
  await assert.rejects(
    live().create({
      amountRial: 10_000,
      trackerId: 't',
      callbackUrl: 'https://app.example.test/cb',
      mobile: null,
    }),
    (error: Error) =>
      error.name === 'Error' && /no_psp_available/.test(error.message),
  );
});

test('verify success maps the payment object', async () => {
  route('POST', '/payments/pay-uuid/verify', () =>
    Response.json({
      uuid: 'pay-uuid',
      amount: 120_000,
      status: 5,
      psp: 'SEP',
      terminal: '12345678',
      trace_number: 687668,
      reference_number: '21458790785',
      masked_paid_card_number: '6219    0852',
      mobile_number: '09121234567',
    }),
  );
  const verified = await live().verify(payment);
  assert.equal(verified.ok, true);
  assert.equal(verified.amountRial, 120_000);
  assert.equal(verified.traceNumber, '687668');
  assert.equal(verified.terminal, '12345678');
  assert.equal(verified.maskedCard, '6219*0852');
  assert.equal(
    (verified.raw as Record<string, unknown>)['mobile_number'],
    undefined,
    'employee mobile is not kept in raw',
  );
});

test('ambiguous verify asks for the real status', async () => {
  route('POST', '/payments/pay-uuid/verify', () =>
    Response.json(
      { non_field_errors: [{ code: 'status_change_not_allowed' }] },
      { status: 400 },
    ),
  );
  route('GET', '/payments/pay-uuid', () =>
    Response.json({
      uuid: 'pay-uuid',
      amount: 120_000,
      status: 5,
      terminal_number: 14115046,
    }),
  );
  const verified = await live().verify(payment);
  assert.equal(verified.ok, true);
  assert.equal(verified.terminal, '14115046');
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path} ${call.scope}`),
    [
      'POST /payments/pay-uuid/verify payment.create',
      'GET /payments/pay-uuid payment.list',
    ],
  );
});

test('rejected verify is a definite failure without inquiry', async () => {
  route('POST', '/payments/pay-uuid/verify', () =>
    Response.json(
      { non_field_errors: [{ code: 'psp_verify_rejected' }] },
      { status: 400 },
    ),
  );
  const verified = await live().verify(payment);
  assert.equal(verified.ok, false);
  assert.equal(verified.unknown, undefined);
  assert.equal(verified.pending, undefined);
  assert.equal(calls.length, 1);
});

test('verify with no answer at all stays pending for the reconciliation cron', async () => {
  route('POST', '/payments/pay-uuid/verify', () => {
    throw new TypeError('fetch failed');
  });
  route('GET', '/payments/pay-uuid', () => {
    throw new TypeError('fetch failed');
  });
  const verified = await live().verify(payment);
  assert.equal(verified.ok, false);
  assert.equal(verified.pending, true);
});

test('inquire maps every Toman payment status', async () => {
  const expected: Record<number, string> = {
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'returned',
    5: 'verified',
    0: 'failed',
    [-1]: 'failed',
    [-2]: 'expired',
    [-3]: 'unknown',
  };
  for (const [status, state] of Object.entries(expected)) {
    route('GET', '/payments/pay-uuid', () =>
      Response.json({
        uuid: 'pay-uuid',
        amount: 120_000,
        status: Number(status),
      }),
    );
    assert.equal(
      (await live().inquire(payment)).state,
      state,
      `status ${status}`,
    );
  }
  // Toman's own Unknown (-3) through verify is "unknown", never retried
  route('POST', '/payments/pay-uuid/verify', () =>
    Response.json(
      { non_field_errors: [{ code: 'psp_not_respond' }] },
      { status: 400 },
    ),
  );
  route('GET', '/payments/pay-uuid', () =>
    Response.json({ uuid: 'pay-uuid', amount: 120_000, status: -3 }),
  );
  assert.equal((await live().verify(payment)).unknown, true);
});

test('refund create and status mapping', async () => {
  const ref = {
    payment,
    trackerId: 'refund-tracker',
    ref: null,
    amountRial: 50_000,
  };
  route('POST', '/payments/pay-uuid/refund', () =>
    Response.json({
      uuid: 'refund-uuid',
      payment: 'pay-uuid',
      status: 0,
      amount: 50_000,
    }),
  );
  const created = await live().refund(ref);
  assert.equal(created.state, 'pending');
  assert.equal(created.ref, 'refund-uuid');
  assert.deepEqual(calls.at(-1)?.body, {
    amount: 50_000,
    tracker_id: 'refund-tracker',
  });
  assert.equal(calls.at(-1)?.scope, 'ipg.refund.create');

  route('POST', '/payments/pay-uuid/refund', () =>
    Response.json(
      { non_field_errors: [{ code: 'not_enough_balance' }] },
      { status: 400 },
    ),
  );
  assert.equal((await live().refund(ref)).state, 'denied');

  route('POST', '/payments/pay-uuid/refund', () =>
    Response.json({ tracker_id: [{ code: 'unique' }] }, { status: 400 }),
  );
  assert.equal((await live().refund(ref)).state, 'unreachable');

  route(
    'POST',
    '/payments/pay-uuid/refund',
    () => new Response(null, { status: 502 }),
  );
  assert.equal((await live().refund(ref)).state, 'unreachable');

  const statuses: Record<number, string> = {
    0: 'pending',
    1: 'pending',
    [-1]: 'pending',
    2: 'succeeded',
    3: 'failed',
    4: 'denied',
  };
  for (const [status, state] of Object.entries(statuses)) {
    route('GET', '/refunds/tracking/refund-tracker', () =>
      Response.json({
        uuid: 'refund-uuid',
        payment: 'pay-uuid',
        status: Number(status),
        amount: 50_000,
      }),
    );
    const result = await live().refundStatus(ref);
    assert.equal(result.state, state, `refund status ${status}`);
    assert.equal(calls.at(-1)?.scope, 'ipg.refund.read');
  }
  route('GET', '/refunds/tracking/refund-tracker', () =>
    Response.json(
      { non_field_errors: [{ code: 'refund_not_found' }] },
      { status: 404 },
    ),
  );
  assert.equal((await live().refundStatus(ref)).state, 'missing');
});

test('refund wallet reads GET /wallet/refund with its own scope', async () => {
  route('GET', '/wallet/refund', () =>
    Response.json({ balance: 1_234_560, address: 'ipgrw-abc' }),
  );
  assert.deepEqual(await live().refundWallet(), {
    balanceRial: 1_234_560,
    address: 'ipgrw-abc',
  });
  assert.equal(calls[0].scope, 'ipg.wallet.read');

  // a missing scope / network error surfaces to the dashboard instead of a fake 0
  routes.clear();
  route('GET', '/wallet/refund', () =>
    Response.json({ detail: 'forbidden' }, { status: 403 }),
  );
  await assert.rejects(live().refundWallet(), /403/);
});

test('mock refund wallet has a fixed balance, overridable for the low warning', async () => {
  const gateway = new TomanIpgGateway(new TomanIpgMockClient());
  assert.equal(gateway.simulated, true);
  assert.equal((await gateway.refundWallet()).balanceRial, 100_000_000);
  process.env.UPG_MOCK_REFUND_WALLET_RIAL = '2000000';
  assert.equal((await gateway.refundWallet()).balanceRial, 2_000_000);
});

test('error bodies follow non_field_errors / <field>', () => {
  assert.deepEqual(
    parseErrors(
      JSON.stringify({
        non_field_errors: [{ code: 'partner_info_not_fetched', detail: 'x' }],
        amount: [{ code: 'required', detail: 'This field is required.' }],
      }),
    ),
    { codes: ['partner_info_not_fetched', 'required'], fields: ['amount'] },
  );
  assert.deepEqual(parseErrors(JSON.stringify({ detail: 'Not found.' })), {
    codes: ['http_404_not_found'],
    fields: [],
  });
  assert.deepEqual(parseErrors('<html>'), { codes: [], fields: [] });
});

test('mock client runs the same gateway logic end to end', async () => {
  const gateway = new TomanIpgGateway(new TomanIpgMockClient());
  const mock = gateway.mock as TomanIpgMockClient;
  const created = await gateway.create({
    amountRial: 120_000,
    trackerId: 'mock-tracker',
    callbackUrl: 'http://localhost:6200/api/upg/callback/toman',
    mobile: '09121234567',
  });
  assert.match(
    created.redirectUrl,
    /^http:\/\/localhost:6200\/api\/upg\/mock-toman\//,
  );
  const ref = { ...payment, ref: created.ref, trackerId: 'mock-tracker' };

  // callback before the user finished at the bank → still pending
  assert.equal(mock.open(created.ref)?.amount, 120_000);
  assert.equal((await gateway.verify(ref)).pending, true);

  const back = mock.complete(created.ref, 'success');
  assert.equal(back?.fields['status'], '4');
  assert.equal(
    gateway.parseCallback(back?.fields ?? {}).trackerId,
    'mock-tracker',
  );
  const verified = await gateway.verify(ref);
  assert.equal(verified.ok, true);
  assert.equal(verified.amountRial, 120_000);
  // a second verify (duplicate callback / cron race) still reports success
  assert.equal((await gateway.verify(ref)).ok, true);

  const refund = {
    payment: ref,
    trackerId: 'mock-refund',
    ref: null,
    amountRial: 70_000,
  };
  assert.equal((await gateway.refund(refund)).state, 'pending');
  assert.equal(
    (await gateway.refund(refund)).state,
    'unreachable',
    'duplicate tracker',
  );
  assert.equal(
    (
      await gateway.refund({
        ...refund,
        trackerId: 'too-much',
        amountRial: 60_000,
      })
    ).state,
    'failed',
    'more than what is left of the payment',
  );
  assert.equal((await gateway.refundStatus(refund)).state, 'succeeded');

  process.env.UPG_MOCK_REFUND_RESULT = 'denied';
  const second = { ...refund, trackerId: 'mock-refund-2', amountRial: 50_000 };
  assert.equal((await gateway.refund(second)).state, 'pending');
  assert.equal((await gateway.refundStatus(second)).state, 'denied');
  // a denied refund frees the payment's room again
  assert.equal(
    (await gateway.refund({ ...second, trackerId: 'mock-refund-3' })).state,
    'pending',
  );

  const failed = await gateway.create({
    amountRial: 10_000,
    trackerId: 'mock-failed',
    callbackUrl: 'http://localhost:6200/api/upg/callback/toman',
    mobile: null,
  });
  mock.open(failed.ref);
  mock.complete(failed.ref, 'failed');
  const rejected = await gateway.verify({ ...payment, ref: failed.ref });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.pending, undefined);
});
