import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TomanOAuth } from '../src/app/toman/toman-oauth';
import {
  tomanLog,
  tomanOperation,
  withTomanTrace,
} from '../src/app/toman/toman-log';

test('persistent logs isolate concurrent traces and exclude credentials and provider details', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'toman-logging-'));
  const previous = process.env.TOMAN_LOG_DIR;
  const originalFetch = globalThis.fetch;
  process.env.TOMAN_LOG_DIR = directory;
  try {
    const task = (paymentId: string, trackerId: string) =>
      withTomanTrace({ paymentId, trackerId }, async () => {
        await Promise.resolve();
        tomanLog('test.concurrent', {
          password: 'secret-password',
          raw: { token: 'secret-token' },
          headers: 'Bearer secret-token',
        });
      });
    await Promise.all([
      task('payment-a', 'tracker-a'),
      task('payment-b', 'tracker-b'),
    ]);
    globalThis.fetch = (async () =>
      Response.json(
        {
          error: 'invalid_scope',
          error_description: 'secret-password account IR1234567890',
          access_token: 'secret-token',
        },
        { status: 400 },
      )) as typeof fetch;
    const oauth = new TomanOAuth({
      label: 'test',
      authUrl: () =>
        'https://user:secret-password@auth.example.test/token?secret=secret-token',
      credentials: () => ({
        username: 'secret-username',
        password: 'secret-password',
        clientId: 'secret-client',
        clientSecret: 'secret-client-secret',
      }),
      timeoutMs: () => 1000,
    });
    await assert.rejects(() =>
      withTomanTrace(
        { paymentId: 'failed-payment', trackerId: 'failed-tracker' },
        () =>
          oauth.fetch('https://api.example.test/payments', 'payment.create'),
      ),
    );
    await assert.rejects(() =>
      tomanOperation('test.database', { paymentId: 'db-failure' }, async () => {
        throw Object.assign(new Error('secret-password'), { code: 'P2002' });
      }),
    );
    tomanLog('test.outside');
    const file = join(directory, readdirSync(directory)[0]);
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(
      text,
      /secret-password|secret-token|secret-username|secret-client|IR1234567890|error_description|access_token/,
    );
    const rows = text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const concurrent = rows.filter((row) => row.event === 'test.concurrent');
    assert.equal(concurrent.length, 2);
    assert.equal(concurrent[0].paymentId, 'payment-a');
    assert.equal(concurrent[0].trackerId, 'tracker-a');
    assert.equal(concurrent[1].paymentId, 'payment-b');
    assert.notEqual(concurrent[0].traceId, concurrent[1].traceId);
    assert.equal(rows.at(-1).traceId, undefined);
    const rejected = rows.find((row) => row.event === 'oauth.rejected');
    assert.deepEqual(rejected.codes, ['invalid_scope']);
    assert.equal(rejected.paymentId, 'failed-payment');
    assert.equal(rejected.httpStatus, 400);
    assert.equal(
      rows.find((row) => row.event === 'test.database.failed').errorCode,
      'P2002',
    );
    assert.equal(statSync(file).mode & 0o777, 0o600);
    // Broken disk output cannot turn a successful financial operation into a retry.
    process.env.TOMAN_LOG_DIR = file;
    assert.doesNotThrow(() => tomanLog('test.disk_failure'));
  } finally {
    globalThis.fetch = originalFetch;
    if (previous === undefined) delete process.env.TOMAN_LOG_DIR;
    else process.env.TOMAN_LOG_DIR = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
