import { Logger } from '@nestjs/common';
import {
  TomanOAuth,
  tomanCredentialsFromEnv,
} from '../../../toman/toman-oauth';
import {
  TomanCreatePaymentBody,
  TomanIpgApi,
  TomanIpgError,
  TomanIpgPayment,
  TomanIpgRefund,
  TomanRefundWallet,
} from './toman-ipg.types';

/**
 * scopeهای IPG. هرکدام توکن جدا دارد (`TomanOAuth`)، پس نبودِ scope بازگشت پول
 * فقط «بازگشت پول» را از کار می‌اندازد.
 */
export const TOMAN_IPG_SCOPES = {
  /** ساخت و verify پرداخت */
  create: 'payment.create',
  /** استعلام پرداخت */
  list: 'payment.list',
  refundCreate: 'ipg.refund.create',
  /** پیگیری بازگشت پول — در فهرست اولیهٔ scopeها نبود ولی بدون آن پیگیری ممکن نیست */
  refundRead: 'ipg.refund.read',
  /** موجودی کیف پول بازگشت، برای هشدار داشبورد */
  refundWallet: 'ipg.wallet.read',
} as const;

export const TOMAN_IPG_STAGING_URL = 'https://ipg-staging.toman.ir';
export const TOMAN_IPG_STAGING_AUTH_URL =
  'https://auth.qbitpay.org/oauth2/token/';

/**
 * کلاینت واقعی IPG تومان.
 *
 * env: `TOMAN_IPG_URL` (پیش‌فرض staging)، `TOMAN_IPG_AUTH_URL`،
 * `TOMAN_IPG_USERNAME|PASSWORD|CLIENT_ID|CLIENT_SECRET` (اگر خالی باشند همان
 * اعتبارنامهٔ بانکداری شرکتی `TOMAN_*`)، `TOMAN_IPG_TERMINAL` (اختیاری)،
 * `TOMAN_IPG_TIMEOUT_MS`.
 */
export class TomanIpgHttpClient implements TomanIpgApi {
  readonly live = true;
  private readonly logger = new Logger(TomanIpgHttpClient.name);
  private readonly oauth = new TomanOAuth({
    label: 'درگاه پرداخت تومان',
    authUrl: () => this.authUrl,
    credentials: () =>
      tomanCredentialsFromEnv('TOMAN_IPG_') ??
      tomanCredentialsFromEnv('TOMAN_'),
    timeoutMs: () => Number(process.env.TOMAN_IPG_TIMEOUT_MS || 20_000),
  });

  get baseUrl(): string {
    return (process.env.TOMAN_IPG_URL || TOMAN_IPG_STAGING_URL).replace(
      /\/+$/,
      '',
    );
  }

  get authUrl(): string {
    return process.env.TOMAN_IPG_AUTH_URL || TOMAN_IPG_STAGING_AUTH_URL;
  }

  createPayment(body: TomanCreatePaymentBody) {
    return this.request<{ uuid: string; tracker_id?: string | null }>(
      'POST',
      '/payments',
      TOMAN_IPG_SCOPES.create,
      body,
    );
  }

  /** بدون احراز هویت؛ مرورگر مستقیم به آن می‌رود */
  redirectUrl(uuid: string): string {
    return `${this.baseUrl}/payments/${encodeURIComponent(uuid)}/redirect`;
  }

  verifyPayment(uuid: string) {
    return this.request<TomanIpgPayment>(
      'POST',
      `/payments/${encodeURIComponent(uuid)}/verify`,
      TOMAN_IPG_SCOPES.create,
    );
  }

  getPayment(uuid: string) {
    return this.request<TomanIpgPayment>(
      'GET',
      `/payments/${encodeURIComponent(uuid)}`,
      TOMAN_IPG_SCOPES.list,
    );
  }

  createRefund(
    paymentUuid: string,
    body: { amount: number; tracker_id: string },
  ) {
    return this.request<TomanIpgRefund>(
      'POST',
      `/payments/${encodeURIComponent(paymentUuid)}/refund`,
      TOMAN_IPG_SCOPES.refundCreate,
      body,
    );
  }

  getRefundByTracker(trackerId: string) {
    return this.request<TomanIpgRefund>(
      'GET',
      `/refunds/tracking/${encodeURIComponent(trackerId)}`,
      TOMAN_IPG_SCOPES.refundRead,
    );
  }

  getRefundWallet() {
    return this.request<TomanRefundWallet>(
      'GET',
      '/wallet/refund',
      TOMAN_IPG_SCOPES.refundWallet,
    );
  }

  /** فقط برای اسکریپت بررسی: آیا این scope برای حساب ما فعال است؟ */
  token(scope: string): Promise<string> {
    return this.oauth.accessToken(scope);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    scope: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.oauth.fetch(`${this.baseUrl}${path}`, scope, {
        method,
        headers: { Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      // خطای توکن (ServiceUnavailableException) هم این‌جا می‌رسد: یعنی
      // درخواست اصلی هرگز فرستاده نشد
      this.logger.error(
        `Toman IPG ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new TomanIpgError(null);
    }
    if (response.ok) return (await response.json()) as T;
    throw await this.toError(response, `${method} ${path}`);
  }

  private async toError(response: Response, label: string) {
    const text = await response.text().catch(() => '');
    const { codes, fields } = parseErrors(text);
    if (response.status === 404 && codes.length === 0) {
      codes.push('http_404_not_found');
    }
    // کدهای خطا داده‌ای از کارت یا کاربر ندارند؛ متن detail را لاگ نمی‌کنیم
    this.logger.error(
      `Toman IPG ${label}: HTTP ${response.status} ${codes.join(', ')}`,
    );
    return new TomanIpgError(response.status, codes, fields);
  }
}

/**
 * `{ non_field_errors: [{code, detail}], amount: [{code, detail}] }` → کدها و
 * نام فیلدها. خطاهای عمومی DRF (`{ detail: "Not found." }`) و کد HTTP 404
 * هم به `http_404_not_found` نگاشته می‌شوند تا تصمیم‌گیری یک‌جا بماند.
 */
export function parseErrors(text: string): {
  codes: string[];
  fields: string[];
} {
  const codes: string[] = [];
  const fields: string[] = [];
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { codes, fields };
  }
  if (!body || typeof body !== 'object') return { codes, fields };

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const entries = Array.isArray(value) ? value : [value];
    let found = false;
    for (const entry of entries) {
      if (entry && typeof entry === 'object' && 'code' in entry) {
        codes.push(String((entry as { code: unknown }).code));
        found = true;
      } else if (key === 'code' && typeof entry === 'string') {
        codes.push(entry);
        found = true;
      }
    }
    if (key !== 'non_field_errors' && key !== 'detail' && key !== 'code') {
      fields.push(key);
    }
    if (!found && key === 'detail' && /not found/i.test(String(value))) {
      codes.push('http_404_not_found');
    }
  }
  return { codes, fields };
}
