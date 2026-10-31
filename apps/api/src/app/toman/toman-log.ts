import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Deliberate allowlist: never serialize request bodies, headers, raw provider
// responses or Error.message (all may contain credentials or personal data).
const fields = new Set([
  'traceId',
  'requestId',
  'paymentId',
  'intentId',
  'trackerId',
  'ref',
  'allocationId',
  'batchId',
  'itemId',
  'refundId',
  'runKey',
  'gateway',
  'component',
  'source',
  'method',
  'endpoint',
  'scope',
  'attempt',
  'httpStatus',
  'durationMs',
  'providerStatus',
  'status',
  'previousStatus',
  'reason',
  'errorName',
  'errorCode',
  'causeCode',
  'codes',
  'errorFields',
  'amountToman',
  'amountRial',
  'expectedAmountRial',
  'count',
  'succeeded',
  'failed',
  'mode',
  'enabled',
  'apiUrl',
  'authUrl',
  'timeoutMs',
  'expiresIn',
  'providerRequestId',
  'beneficiaryType',
  'storeId',
  'types',
  'changed',
  'credentialsConfigured',
]);
type Context = Record<string, unknown>;
const context = new AsyncLocalStorage<Context>();

export function withTomanTrace<T>(details: Context, work: () => T): T {
  const parent = context.getStore();
  return context.run({ traceId: randomUUID(), ...parent, ...details }, work);
}

export function tomanOperation<T>(
  event: string,
  details: Context,
  work: () => Promise<T>,
): Promise<T> {
  return withTomanTrace(details, async () => {
    const started = Date.now();
    tomanLog(`${event}.started`);
    try {
      const result = await work();
      const summary = result as { status?: string; itemCount?: number } | null;
      tomanLog(`${event}.finished`, {
        status: summary?.status,
        count: summary?.itemCount,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      tomanLog(
        `${event}.failed`,
        { ...tomanError(error), durationMs: Date.now() - started },
        'error',
      );
      throw error;
    }
  });
}

export function safeEndpoint(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return 'invalid_url';
  }
}

export function tomanError(error: unknown): Context {
  const e = error as {
    name?: unknown;
    code?: unknown;
    cause?: { code?: unknown };
  } | null;
  const safeCode = (v: unknown) =>
    typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(v) ? v : undefined;
  return {
    errorName: safeCode(e?.name) ?? 'Error',
    errorCode: safeCode(e?.code),
    causeCode: safeCode(e?.cause?.code),
  };
}

/** Extract machine codes only; provider detail/error_description are untrusted. */
export function tomanErrorCodes(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (item: unknown, depth: number) => {
    if (depth > 5 || found.size >= 30 || !item || typeof item !== 'object')
      return;
    for (const [key, val] of Object.entries(item)) {
      if (
        (key === 'code' || key === 'error') &&
        typeof val === 'string' &&
        /^[a-zA-Z0-9_.-]{1,80}$/.test(val)
      )
        found.add(val);
      else if (typeof val === 'object') walk(val, depth + 1);
    }
  };
  walk(value, 0);
  return [...found];
}

export function tomanLog(
  event: string,
  details: Context = {},
  level: 'info' | 'warn' | 'error' = 'info',
): void {
  const safe: Context = {};
  for (const [key, value] of Object.entries({
    ...context.getStore(),
    ...details,
  })) {
    if (!fields.has(key) || value === undefined) continue;
    if (Array.isArray(value))
      safe[key] = value.slice(0, 100).map((v) => String(v).slice(0, 150));
    else if (typeof value === 'string') safe[key] = value.slice(0, 500);
    else if (typeof value === 'bigint') safe[key] = value.toString();
    else if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      safe[key] = value;
  }
  const time = new Date().toISOString();
  const line = JSON.stringify({ time, level, system: 'toman', event, ...safe });
  // stdout remains available even if disk logging fails. Logging must never
  // throw into a money-moving operation and cause it to be retried.
  console.log(line);
  const directory = process.env.TOMAN_LOG_DIR;
  if (directory) {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      appendFileSync(
        join(directory, `toman-${time.slice(0, 10)}.jsonl`),
        `${line}\n`,
        { mode: 0o600 },
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          time,
          system: 'toman',
          level: 'error',
          event: 'log.write_failed',
          ...tomanError(error),
        }),
      );
    }
  }
}
