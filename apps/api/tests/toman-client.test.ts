import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TomanClientService } from '../src/app/settlements/toman-client.service';

const AUTH_URL = 'https://auth.example.test/oauth2/token/';
const API_URL = 'https://api.example.test/api/v1';
const CREATE_SCOPE = 'digital_banking.batch_transfer.create';
const BATCH_READ_SCOPE = 'digital_banking.batch_transfer.read';
const TRANSFER_READ_SCOPE = 'digital_banking.transfer.read';

test('reuses scoped tokens and re-authenticates once after 401 or 403', async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  const events: string[] = [];
  const scopes: string[] = [];
  let tokenSequence = 0;
  let latestToken = '';
  const rejectedScopes = new Set<string>();

  process.env.TOMAN_MODE = 'live';
  process.env.TOMAN_AUTH_URL = AUTH_URL;
  process.env.TOMAN_API_URL = API_URL;
  process.env.TOMAN_USERNAME = 'test-user';
  process.env.TOMAN_PASSWORD = 'test-password';
  process.env.TOMAN_CLIENT_ID = 'test-client';
  process.env.TOMAN_CLIENT_SECRET = 'test-secret';

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    if (url.href === AUTH_URL) {
      events.push('auth');
      const body = init?.body;
      assert.ok(body instanceof URLSearchParams);
      const scope = body.get('scope');
      assert.ok(scope);
      scopes.push(scope);
      assert.equal(body.get('grant_type'), 'password');
      latestToken = `token-${++tokenSequence}`;
      return new Response(JSON.stringify({ access_token: latestToken }), {
        status: 200,
      });
    }

    events.push('api');
    assert.ok(url.href.startsWith(`${API_URL}/`));
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      `Bearer ${latestToken}`,
    );

    const activeScope = scopes.at(-1);
    if (activeScope && !rejectedScopes.has(activeScope)) {
      rejectedScopes.add(activeScope);
      if (activeScope === CREATE_SCOPE)
        return new Response(null, { status: 401 });
      if (activeScope === BATCH_READ_SCOPE)
        return new Response(null, { status: 403 });
    }

    if (url.pathname.endsWith('/add-items/')) {
      const payload = JSON.parse(String(init?.body)) as {
        items: Array<{ tracker_id: string }>;
      };
      return Response.json({
        items: payload.items.map((item) => ({
          uuid: `item-${item.tracker_id}`,
          tracker_id: item.tracker_id,
        })),
      });
    }
    if (url.pathname.endsWith('/commit/')) {
      return Response.json({ message: 'committed' });
    }
    if (url.pathname.endsWith('/items/')) {
      const page = url.searchParams.get('page');
      return Response.json({
        count: 2,
        next:
          page === '1' ? `${API_URL}/batch-transfer/batch/items/?page=2` : null,
        results: [{ uuid: `item-${page}`, tracker_id: `tracker-${page}` }],
      });
    }
    if (url.pathname.includes('/transfer/tracker/')) {
      return Response.json({ uuid: 'transfer-1', status: 6 });
    }
    if (init?.method === 'POST') {
      return Response.json({ uuid: 'batch', status: 1 });
    }
    return Response.json({ uuid: 'batch', status: 4 });
  }) as typeof fetch;

  try {
    const client = new TomanClientService();
    await client.createBatch(1_000, 1);
    await client.addItems('batch', [
      {
        amount: 1_000,
        iban_destination: 'IR000000000000000000000000',
        tracker_id: 'tracker',
        reason: 6,
      },
    ]);
    await client.commitBatch('batch');
    assert.equal((await client.listBatchItems('batch')).length, 2);
    await client.getBatch('batch');
    await client.getTransfer('tracker');

    assert.deepEqual(scopes, [
      CREATE_SCOPE,
      CREATE_SCOPE,
      BATCH_READ_SCOPE,
      BATCH_READ_SCOPE,
      TRANSFER_READ_SCOPE,
    ]);
    assert.deepEqual(events, [
      'auth',
      'api',
      'auth',
      'api',
      'api',
      'api',
      'auth',
      'api',
      'auth',
      'api',
      'api',
      'api',
      'auth',
      'api',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [
      'TOMAN_MODE',
      'TOMAN_AUTH_URL',
      'TOMAN_API_URL',
      'TOMAN_USERNAME',
      'TOMAN_PASSWORD',
      'TOMAN_CLIENT_ID',
      'TOMAN_CLIENT_SECRET',
    ]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
