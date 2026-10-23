import { Logger, ServiceUnavailableException } from '@nestjs/common';

/**
 * توکن OAuth2 تومان (password grant) — مشترک بین بانکداری شرکتی
 * (`settlements/toman-client.service.ts`) و درگاه IPG (`upg/gateways/toman/`).
 *
 * برای هر scope یک توکن جدا گرفته و کش می‌شود: تومان چند scope را با فاصله
 * در یک توکن می‌پذیرد، ولی اگر حتی یکی از آن‌ها برای کاربر ما فعال نباشد
 * کل درخواست `invalid_scope` می‌گیرد — با توکن جدا، نبودِ مثلاً
 * `ipg.refund.create` فقط بازگشت پول را از کار می‌اندازد، نه پرداخت را.
 */
export interface TomanCredentials {
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
}

export interface TomanOAuthOptions {
  /** برای پیام خطا و لاگ — «بانکداری شرکتی تومان» / «درگاه پرداخت تومان» */
  label: string;
  authUrl: () => string;
  /** null یعنی تنظیمات ناقص است */
  credentials: () => TomanCredentials | null;
  timeoutMs: () => number;
}

type TokenResponse = {
  access_token: string;
  expires_in?: number;
};

type CachedToken = {
  access: string;
  expiresAt: number;
};

export class TomanOAuth {
  private readonly logger = new Logger(TomanOAuth.name);
  private readonly tokens = new Map<string, CachedToken>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  constructor(private readonly options: TomanOAuthOptions) {}

  async accessToken(scope: string): Promise<string> {
    const cached = this.tokens.get(scope);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.access;

    const pending = this.tokenRequests.get(scope);
    if (pending) return pending;

    const request = this.fetchAccessToken(scope).finally(() => {
      if (this.tokenRequests.get(scope) === request)
        this.tokenRequests.delete(scope);
    });
    this.tokenRequests.set(scope, request);
    return request;
  }

  /** بعد از 401/403 — توکن بعدی دوباره گرفته می‌شود */
  invalidate(scope: string): void {
    this.tokens.delete(scope);
  }

  /**
   * درخواست با توکن همان scope؛ اگر 401/403 برگشت، یک‌بار با توکن تازه
   * تکرار می‌شود (توکن ممکن است زودتر از `expires_in` باطل شده باشد).
   * پاسخ خام برمی‌گردد — تفسیر خطا با فراخوان است.
   */
  async fetch(
    url: string,
    scope: string,
    init: RequestInit = {},
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken(scope);
      const response = await this.fetchWithTimeout(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      if ((response.status === 401 || response.status === 403) && attempt === 0) {
        await response.body?.cancel();
        this.invalidate(scope);
        continue;
      }
      return response;
    }
  }

  fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.options.timeoutMs()),
    });
  }

  private async fetchAccessToken(scope: string): Promise<string> {
    const credentials = this.options.credentials();
    if (!credentials) {
      throw new ServiceUnavailableException(
        `تنظیمات احراز هویت ${this.options.label} کامل نیست`,
      );
    }
    const body = new URLSearchParams({
      grant_type: 'password',
      username: credentials.username,
      password: credentials.password,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      scope,
    });
    const response = await this.fetchWithTimeout(this.options.authUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      // پاسخ خطای OAuth فقط کد (`invalid_scope` …) دارد؛ رمز در آن نیست
      const detail = await response.text().catch(() => '');
      this.logger.error(
        `${this.options.label} oauth2/token (${scope}): HTTP ${response.status} ${detail.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException({
        message: `احراز هویت ${this.options.label} ناموفق بود`,
        status: response.status,
      });
    }
    const data = (await response.json()) as TokenResponse;
    this.tokens.set(scope, {
      access: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 86_400) * 1_000,
    });
    return data.access_token;
  }
}

/** چهار متغیر محیطی اعتبارنامه — null اگر یکی خالی باشد */
export function tomanCredentialsFromEnv(
  prefix: string,
): TomanCredentials | null {
  const username = process.env[`${prefix}USERNAME`];
  const password = process.env[`${prefix}PASSWORD`];
  const clientId = process.env[`${prefix}CLIENT_ID`];
  const clientSecret = process.env[`${prefix}CLIENT_SECRET`];
  if (!username || !password || !clientId || !clientSecret) return null;
  return { username, password, clientId, clientSecret };
}
