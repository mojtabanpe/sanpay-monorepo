// Runs inside the API container using its already-loaded production environment.
const env = process.env;
const batches = JSON.parse(env.SANPAY_DIAGNOSTIC_BATCHES || '[]');
const tokens = new Map();
const api = new URL(
  (env.TOMAN_API_URL || 'https://dbank-staging.qcluster.org/api/v1').replace(
    /\/$/,
    '',
  ) + '/',
);
const auth = new URL(
  env.TOMAN_AUTH_URL || 'https://auth.qbitpay.org/oauth2/token/',
);
if (
  api.protocol !== 'https:' ||
  auth.protocol !== 'https:' ||
  api.username ||
  api.password ||
  auth.username ||
  auth.password
) {
  throw new Error('Expected HTTPS provider endpoints without URL credentials.');
}
// Preserve provider error structure while masking common personal/secret values.
const redact = (value) => {
  if (typeof value === 'string')
    return value
      .replace(/\bIR\d{24}\b/gi, '[IBAN]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        '[TOKEN]',
      )
      .replace(/\b\d{10,}\b/g, '[NUMBER]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /password|secret|token|authorization|iban|account|phone|mobile|name/i.test(
          key,
        )
          ? '[REDACTED]'
          : redact(item),
      ]),
    );
  return value;
};
const print = (value) => console.log(JSON.stringify(redact(value), null, 2));
async function request(path, scope) {
  if (!tokens.has(scope)) {
    for (const key of ['USERNAME', 'PASSWORD', 'CLIENT_ID', 'CLIENT_SECRET']) {
      if (!env['TOMAN_' + key]) throw new Error('Missing TOMAN_' + key);
    }
    const response = await fetch(auth, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        username: env.TOMAN_USERNAME,
        password: env.TOMAN_PASSWORD,
        client_id: env.TOMAN_CLIENT_ID,
        client_secret: env.TOMAN_CLIENT_SECRET,
        scope,
      }),
    });
    if (!response.ok) {
      print({
        stage: 'oauth',
        httpStatus: response.status,
        scope,
        providerRequestId: response.headers.get('x-request-id'),
      });
      throw new Error(
        'Token request rejected; credentials and token are not printed.',
      );
    }
    const token = await response.json();
    if (!token.access_token)
      throw new Error('Token response is missing access_token.');
    tokens.set(scope, token.access_token);
  }
  const response = await fetch(new URL(path, api), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${tokens.get(scope)}`,
      Accept: 'application/json',
    },
  });
  const data = await response.json().catch(() => null);
  const selected =
    data && typeof data === 'object'
      ? Object.fromEntries(
          [
            'uuid',
            'status',
            'errors',
            'error',
            'code',
            'detail',
            'message',
            'non_field_errors',
            'follow_up_code',
          ]
            .filter((key) => key in data)
            .map((key) => [key, data[key]]),
        )
      : { detail: 'Response was not a JSON object' };
  return {
    httpStatus: response.status,
    providerRequestId:
      response.headers.get('x-request-id') ||
      response.headers.get('x-correlation-id'),
    ...selected,
  };
}
console.log(
  'Read-only report. No batch/transfer is created, retried or committed.',
);
print({
  collectedAtUTC: new Date().toISOString(),
  api: api.origin + api.pathname,
  mode: env.TOMAN_MODE,
  batchCount: batches.length,
});
for (const batch of batches) {
  print({ localBatch: batch });
  if (env.TOMAN_MODE?.toLowerCase() !== 'live') {
    console.log('Mock mode: skipping provider requests.');
    continue;
  }
  if (!batch.tomanBatchUuid) {
    console.log(
      'No Toman batch UUID: inspect create/authorization errors in logs below.',
    );
    continue;
  }
  try {
    print({
      batchId: batch.id,
      remoteBatch: await request(
        `batch-transfer/${encodeURIComponent(batch.tomanBatchUuid)}/`,
        'digital_banking.batch_transfer.read',
      ),
    });
  } catch (error) {
    console.log('Batch inquiry failed:', error.name, error.message);
  }
  // Bound diagnostics to 20 transfers per batch, retaining failures/unknowns first.
  const items = [...batch.items].sort(
    (a, b) =>
      Number(a.status === 'SUCCEEDED') - Number(b.status === 'SUCCEEDED'),
  );
  if (items.length > 20)
    console.log(`Only 20 of ${items.length} transfers will be queried.`);
  for (const item of items.slice(0, 20)) {
    try {
      print({
        batchId: batch.id,
        trackerId: item.trackerId,
        remoteTransfer: await request(
          `transfer/tracker/${encodeURIComponent(item.trackerId)}/`,
          'digital_banking.transfer.read',
        ),
      });
    } catch (error) {
      console.log('Transfer inquiry failed:', error.name, error.message);
    }
  }
}
