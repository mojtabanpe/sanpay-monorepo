/**
 * بررسی خواندنی IPG تومان با اعتبارنامهٔ `.env` — `pnpm nx run api:check-toman-ipg`.
 *
 * ۱. برای هر scope جداگانه توکن می‌گیرد و می‌گوید کدام برای حساب ما فعال است.
 * ۲. یک پرداخت ۱۰٬۰۰۰ ریالی **می‌سازد** (POST /payments) و آن را استعلام می‌کند.
 * ۳. موجودی کیف پول بازگشت (GET /wallet/refund) را می‌خواند، اگر scope دارد.
 *    هیچ verify، refund یا reverseی انجام نمی‌شود: پرداخت ساخته‌شده‌ای که کسی
 *    به آن نرود بعد از ۳۰ دقیقه در خود تومان منقضی می‌شود و پولی جابه‌جا نمی‌شود.
 *
 * آدرس redirect چاپ می‌شود؛ باز کردنش در مرورگر صفحهٔ بانک را نشان می‌دهد
 * (برای دیدن callback، دامنهٔ `UPG_PUBLIC_URL` باید نزد تومان ثبت شده باشد).
 */
import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  TOMAN_IPG_SCOPES,
  TomanIpgHttpClient,
} from '../src/app/upg/gateways/toman/toman-ipg-http.client';

async function main() {
  const fetchOriginal = globalThis.fetch;
  const client = new TomanIpgHttpClient();
  const base = new URL(client.baseUrl);

  // هر درخواستی به IPG جز «ساخت پرداخت» و «استعلام پرداخت» متوقف می‌شود
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input));
    if (url.host === base.host) {
      const method = init?.method ?? 'GET';
      const allowed =
        (method === 'POST' && url.pathname === '/payments') ||
        (method === 'GET' && /^\/payments\/[\w-]+$/.test(url.pathname)) ||
        (method === 'GET' && url.pathname === '/wallet/refund');
      assert.ok(allowed, `check must not call ${method} ${url.pathname}`);
    }
    return fetchOriginal(input, init);
  }) as typeof fetch;

  console.log(`IPG: ${client.baseUrl}`);
  console.log(`Auth: ${process.env.TOMAN_IPG_AUTH_URL || '(staging default)'}`);
  console.log(
    `Credentials: ${process.env.TOMAN_IPG_USERNAME ? 'TOMAN_IPG_*' : 'TOMAN_* (corporate banking fallback)'}`,
  );

  console.log('\nScopes:');
  const granted = new Set<string>();
  for (const scope of [
    ...Object.values(TOMAN_IPG_SCOPES),
    'ipg.payment.reverse',
  ]) {
    try {
      await client.token(scope);
      granted.add(scope);
      console.log(`  ✓ ${scope}`);
    } catch (error) {
      console.log(
        `  ✗ ${scope} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  assert.ok(
    granted.has(TOMAN_IPG_SCOPES.create),
    'payment.create is required to take payments',
  );

  const publicUrl = (
    process.env.UPG_PUBLIC_URL || 'http://localhost:6200'
  ).replace(/\/+$/, '');
  const trackerId = `sanpay-check-${randomUUID()}`;
  const terminal = process.env.TOMAN_IPG_TERMINAL?.trim();
  const created = await client.createPayment({
    amount: 10_000,
    callback_url: `${publicUrl}/api/upg/callback/toman`,
    tracker_id: trackerId,
    ...(terminal ? { options: { terminal_number: terminal } } : {}),
  });
  assert.ok(created.uuid, 'create must return a payment uuid');
  console.log('\nCreated payment (10,000 rial, not verified):');
  console.log(`  uuid       ${created.uuid}`);
  console.log(`  tracker_id ${created.tracker_id ?? trackerId}`);
  console.log(`  redirect   ${client.redirectUrl(created.uuid)}`);

  if (granted.has(TOMAN_IPG_SCOPES.list)) {
    const payment = await client.getPayment(created.uuid);
    assert.equal(payment.uuid, created.uuid);
    console.log('\nInquiry (GET /payments/<uuid>):');
    for (const key of [
      'status',
      'amount',
      'psp',
      'terminal_number',
      'acceptor_code',
      'wage',
      'toman_wage',
      'shaparak_wage',
    ]) {
      console.log(
        `  ${key.padEnd(14)} ${String((payment as unknown as Record<string, unknown>)[key] ?? '—')}`,
      );
    }
  } else {
    console.log(
      '\npayment.list not granted — skipped the inquiry (the reconciliation cron needs it)',
    );
  }
  if (granted.has(TOMAN_IPG_SCOPES.refundWallet)) {
    const wallet = await client.getRefundWallet();
    console.log('\nRefund wallet (GET /wallet/refund):');
    console.log(`  balance    ${wallet.balance} rial`);
    console.log(`  address    ${wallet.address ?? '—'}`);
  } else {
    console.log(
      '\nipg.wallet.read not granted — the dashboard cannot show the refund wallet balance',
    );
  }
  console.log('\nOK — nothing was verified, refunded or reversed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
