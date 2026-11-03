import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TomanOAuth } from '../src/app/toman/toman-oauth';

function client(reject: (scope: string) => boolean) {
  const requested: string[] = [];
  const oauth = new TomanOAuth({
    label: 'test',
    authUrl: () => 'https://auth.test/token/',
    credentials: () => ({
      username: 'u',
      password: 'p',
      clientId: 'c',
      clientSecret: 's',
    }),
    timeoutMs: () => 1000,
    scopes: ['a', 'b'],
  });
  oauth.fetchWithTimeout = async (_url, init) => {
    const scope = new URLSearchParams(String(init.body)).get('scope') ?? '';
    requested.push(scope);
    return reject(scope)
      ? new Response(JSON.stringify({ error: 'invalid_scope' }), {
          status: 400,
        })
      : new Response(
          JSON.stringify({ access_token: `t:${scope}`, expires_in: 3600 }),
        );
  };
  return { oauth, requested };
}

test('one combined token serves every scope', async () => {
  const { oauth, requested } = client(() => false);
  assert.equal(await oauth.accessToken('a'), 't:a b');
  assert.equal(await oauth.accessToken('b'), 't:a b');
  assert.deepEqual(requested, ['a b']);
});

test('rejected combined token falls back to per-scope tokens', async () => {
  const { oauth, requested } = client((s) => s.includes(' '));
  assert.equal(await oauth.accessToken('a'), 't:a');
  assert.equal(await oauth.accessToken('b'), 't:b');
  assert.deepEqual(requested, ['a b', 'a', 'b']);
});
