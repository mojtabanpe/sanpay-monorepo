import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export interface TomanTransferItemInput {
  amount: number;
  iban_destination: string;
  tracker_id: string;
  description?: string;
  first_name?: string;
  last_name?: string;
  reason: number;
}

export interface TomanBatchItemResult {
  uuid?: string;
  tracker_id: string;
  [key: string]: unknown;
}

export interface TomanTransferResult {
  uuid?: string;
  status: number;
  follow_up_code?: string | null;
  receipt_link?: string | null;
  [key: string]: unknown;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

/** کلاینت حداقلی Corporate Banking؛ تنها مرز سامانه با قرارداد HTTP تومان. */
@Injectable()
export class TomanClientService {
  private readonly logger = new Logger(TomanClientService.name);
  private token?: { access: string; refresh?: string; expiresAt: number };

  isLive(): boolean {
    return process.env.TOMAN_MODE?.toLowerCase() === 'live';
  }

  async createBatch(maxAmountRial: number, maxTransferCount: number) {
    if (!this.isLive()) return { uuid: randomUUID(), status: 1 };
    return this.request<{ uuid: string; status: number }>('/batch-transfer/', {
      method: 'POST',
      body: JSON.stringify({ max_amount: maxAmountRial, max_transfer_count: maxTransferCount }),
    });
  }

  async addItems(batchUuid: string, items: TomanTransferItemInput[]) {
    if (!this.isLive()) return items.map((item) => ({ ...item, uuid: randomUUID() }));
    const response = await this.request<TomanBatchItemResult[] | { items: TomanBatchItemResult[] }>(
      `/batch-transfer/${batchUuid}/add-items/`,
      { method: 'POST', body: JSON.stringify({ items }) },
    );
    return Array.isArray(response) ? response : response.items;
  }

  async commitBatch(batchUuid: string) {
    if (!this.isLive()) return { message: 'mock committed successfully' };
    return this.request<{ message: string }>(
      `/batch-transfer/${batchUuid}/commit/`,
      { method: 'POST' },
    );
  }

  /** برای بازیابی امن حالتی که پاسخ add-items در شبکه گم شده است. */
  async listBatchItems(batchUuid: string): Promise<TomanBatchItemResult[]> {
    if (!this.isLive()) return [];
    const all: TomanBatchItemResult[] = [];
    let page = 1;
    while (true) {
      const response = await this.request<{
        count: number;
        next: string | null;
        results: TomanBatchItemResult[];
      }>(`/batch-transfer/${batchUuid}/items/?page_size=1000&page=${page}`);
      all.push(...response.results);
      if (!response.next) return all;
      page += 1;
    }
  }

  async getBatch(batchUuid: string) {
    if (!this.isLive()) return { uuid: batchUuid, status: 4 };
    return this.request<{ uuid: string; status: number }>(`/batch-transfer/${batchUuid}/`);
  }

  async getTransfer(trackerId: string): Promise<TomanTransferResult> {
    if (!this.isLive()) {
      return { uuid: `mock-${trackerId}`, status: 6, follow_up_code: `MOCK-${trackerId.slice(-10)}` };
    }
    return this.request<TomanTransferResult>(
      `/transfer/tracker/${encodeURIComponent(trackerId)}/`,
    );
  }

  private async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const token = await this.accessToken();
    const response = await this.fetchWithTimeout(`${this.apiUrl()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    });
    if (response.status === 401 && retry) {
      this.token = undefined;
      return this.request<T>(path, init, false);
    }
    if (!response.ok) throw await this.httpError(response, path);
    return (await response.json()) as T;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.access;
    const credentials = this.credentials();
    const refreshing = Boolean(this.token?.refresh);
    const body = new URLSearchParams(
      refreshing
        ? {
            grant_type: 'refresh_token',
            refresh_token: this.token?.refresh ?? '',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
          }
        : {
            grant_type: 'password',
            username: credentials.username,
            password: credentials.password,
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
          },
    );
    const response = await this.fetchWithTimeout(this.authUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok && refreshing) {
      this.token = undefined;
      return this.accessToken();
    }
    if (!response.ok) throw await this.httpError(response, 'oauth2/token');
    const data = (await response.json()) as TokenResponse;
    this.token = {
      access: data.access_token,
      refresh: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in ?? 86_400) * 1000,
    };
    return data.access_token;
  }

  private credentials() {
    const username = process.env.TOMAN_USERNAME;
    const password = process.env.TOMAN_PASSWORD;
    const clientId = process.env.TOMAN_CLIENT_ID;
    const clientSecret = process.env.TOMAN_CLIENT_SECRET;
    if (!username || !password || !clientId || !clientSecret) {
      throw new ServiceUnavailableException('تنظیمات احراز هویت تومان کامل نیست');
    }
    return { username, password, clientId, clientSecret };
  }

  private apiUrl() {
    return (process.env.TOMAN_API_URL || 'https://dbank.toman.ir/api/v1').replace(/\/$/, '');
  }

  private authUrl() {
    return process.env.TOMAN_AUTH_URL || 'https://accounts.qbitpay.org/oauth2/token/';
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const timeout = Number(process.env.TOMAN_TIMEOUT_MS || 20_000);
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  }

  private async httpError(response: Response, path: string) {
    const body = (await response.text()).slice(0, 2_000);
    this.logger.error(`Toman ${path}: HTTP ${response.status} ${body}`);
    return new ServiceUnavailableException({
      message: 'ارتباط با بانکداری شرکتی تومان ناموفق بود',
      status: response.status,
      detail: body,
    });
  }
}
