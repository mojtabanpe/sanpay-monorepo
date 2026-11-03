import { ServiceUnavailableException } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import {
  safeEndpoint,
  tomanError,
  tomanErrorCodes,
  tomanLog,
  withTomanTrace,
  tomanErrorBody,
} from './toman-log';

/**
 * توکن OAuth2 تومان (password grant) — مشترک بین بانکداری شرکتی
 * (`settlements/toman-client.service.ts`) و درگاه IPG (`upg/gateways/toman/`).
 *
 * با `scopes` یک توکن برای همهٔ scopeها (جداشده با فاصله) گرفته می‌شود. اگر
 * تومان آن را رد کند (مثلاً یکی از scopeها برای حساب ما فعال نیست و کل
 * درخواست `invalid_scope` می‌گیرد)، تا پایان عمر پروسه برای هر scope توکن جدا
 * گرفته می‌شود تا نبودِ یک scope فقط همان قابلیت را از کار بیندازد.
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
  /** همهٔ scopeهای این کلاینت؛ با آن یک توکن مشترک گرفته می‌شود */
  scopes?: readonly string[];
}

type TokenResponse = {
  access_token: string;
  expires_in?: number;
};

type CachedToken = {
  access: string;
  expiresAt: number;
};

export class TomanTokenRejectedError extends ServiceUnavailableException {
  constructor(message: string, status: number) {
    super({ message, status });
  }
}

export class TomanOAuth {
  private readonly tokens = new Map<string, CachedToken>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  constructor(private readonly options: TomanOAuthOptions) {}

  /** true پس از اینکه تومان توکن مشترک را رد کرد — برگشت به توکن جدا */
  private combinedRejected = false;

  async accessToken(scope: string): Promise<string> {
    const combined = this.combinedScope(scope);
    if (!combined) return this.tokenFor(scope);
    try {
      return await this.tokenFor(combined);
    } catch (error) {
      if (!(error instanceof TomanTokenRejectedError)) throw error;
      this.combinedRejected = true;
      tomanLog('oauth.combined_rejected', { scope: combined }, 'warn');
      return this.tokenFor(scope);
    }
  }

  private combinedScope(scope: string): string | null {
    const scopes = this.options.scopes;
    if (this.combinedRejected || !scopes?.includes(scope)) return null;
    return [...new Set(scopes)].join(' ');
  }

  private async tokenFor(scope: string): Promise<string> {
    const cached = this.tokens.get(scope);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      tomanLog('oauth.cache_hit', { scope });
      return cached.access;
    }

    const pending = this.tokenRequests.get(scope);
    if (pending) {
      tomanLog('oauth.waiting_for_token', { scope });
      return pending;
    }

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
    const combined = this.combinedScope(scope);
    if (combined) this.tokens.delete(combined);
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
    return withTomanTrace(
      { requestId: randomUUID(), component: this.options.label },
      async () => {
        const started = Date.now();
        const details = {
          method: init.method ?? 'GET',
          endpoint: safeEndpoint(url),
          scope,
        };
        tomanLog('http.started', details);
        try {
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
            let codes: string[] = [];
            let providerError: string | undefined;
            if (!response.ok) {
              const text = await response
                .clone()
                .text()
                .catch(() => '');
              providerError = text ? tomanErrorBody(text) : undefined;
              try {
                codes = tomanErrorCodes(JSON.parse(text));
              } catch {
                codes = [];
              }
            }
            tomanLog(
              'http.response',
              {
                ...details,
                attempt: attempt + 1,
                httpStatus: response.status,
                durationMs: Date.now() - started,
                codes,
                providerError,
                providerRequestId:
                  response.headers.get('x-request-id') ??
                  response.headers.get('x-correlation-id'),
              },
              response.ok ? 'info' : 'error',
            );
            if (
              (response.status === 401 || response.status === 403) &&
              attempt === 0
            ) {
              tomanLog(
                'http.auth_retry',
                { ...details, httpStatus: response.status },
                'warn',
              );
              await response.body?.cancel();
              this.invalidate(scope);
              continue;
            }
            return response;
          }
        } catch (error) {
          tomanLog(
            'http.failed',
            {
              ...details,
              ...tomanError(error),
              durationMs: Date.now() - started,
            },
            'error',
          );
          throw error;
        }
      },
    );
  }

  fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, {
      ...init,
      signal: AbortSignal.timeout(this.options.timeoutMs()),
    });
  }

  private async fetchAccessToken(scope: string): Promise<string> {
    const started = Date.now();
    const details = {
      scope,
      authUrl: safeEndpoint(this.options.authUrl()),
      component: this.options.label,
    };
    const credentials = this.options.credentials();
    if (!credentials) {
      tomanLog('oauth.configuration_missing', details, 'error');
      throw new ServiceUnavailableException(
        `تنظیمات احراز هویت ${this.options.label} کامل نیست`,
      );
    }
    tomanLog('oauth.started', details);
    try {
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
        const codes = await response
          .json()
          .then(tomanErrorCodes)
          .catch(() => []);
        tomanLog(
          'oauth.rejected',
          {
            ...details,
            httpStatus: response.status,
            codes,
            durationMs: Date.now() - started,
          },
          'error',
        );
        const message = `احراز هویت ${this.options.label} ناموفق بود`;
        // 400/401/403 = تومان این درخواست را رد کرده (مثلاً invalid_scope)
        if ([400, 401, 403].includes(response.status))
          throw new TomanTokenRejectedError(message, response.status);
        throw new ServiceUnavailableException({
          message,
          status: response.status,
        });
      }
      const data = (await response.json()) as TokenResponse;
      if (typeof data.access_token !== 'string' || !data.access_token) {
        tomanLog('oauth.invalid_response', details, 'error');
        throw new ServiceUnavailableException('پاسخ توکن تومان معتبر نیست');
      }
      this.tokens.set(scope, {
        access: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 86_400) * 1_000,
      });
      tomanLog('oauth.succeeded', {
        ...details,
        expiresIn: data.expires_in ?? 86_400,
        durationMs: Date.now() - started,
      });
      return data.access_token;
    } catch (error) {
      tomanLog(
        'oauth.failed',
        { ...details, ...tomanError(error), durationMs: Date.now() - started },
        'error',
      );
      throw error;
    }
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
