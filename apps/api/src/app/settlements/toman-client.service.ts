import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TomanOAuth, tomanCredentialsFromEnv } from '../toman/toman-oauth';
import { tomanError, tomanLog } from '../toman/toman-log';

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

const BATCH_CREATE_SCOPE = 'digital_banking.batch_transfer.create';
const BATCH_READ_SCOPE = 'digital_banking.batch_transfer.read';
const TRANSFER_READ_SCOPE = 'digital_banking.transfer.read';

/** کلاینت حداقلی Corporate Banking؛ تنها مرز سامانه با قرارداد HTTP تومان. */
@Injectable()
export class TomanClientService {
  private readonly logger = new Logger(TomanClientService.name);
  private readonly oauth = new TomanOAuth({
    label: 'بانکداری شرکتی تومان',
    authUrl: () =>
      process.env.TOMAN_AUTH_URL || 'https://auth.qbitpay.org/oauth2/token/',
    credentials: () => tomanCredentialsFromEnv('TOMAN_'),
    timeoutMs: () => Number(process.env.TOMAN_TIMEOUT_MS || 20_000),
  });

  isLive(): boolean {
    return process.env.TOMAN_MODE?.toLowerCase() === 'live';
  }

  async createBatch(maxAmountRial: number, maxTransferCount: number) {
    if (!this.isLive()) return { uuid: randomUUID(), status: 1 };
    return this.request<{ uuid: string; status: number }>(
      '/batch-transfer/',
      BATCH_CREATE_SCOPE,
      {
        method: 'POST',
        body: JSON.stringify({
          max_amount: maxAmountRial,
          max_transfer_count: maxTransferCount,
        }),
      },
    );
  }

  async addItems(batchUuid: string, items: TomanTransferItemInput[]) {
    if (!this.isLive())
      return items.map((item) => ({ ...item, uuid: randomUUID() }));
    const response = await this.request<
      TomanBatchItemResult[] | { items: TomanBatchItemResult[] }
    >(`/batch-transfer/${batchUuid}/add-items/`, BATCH_CREATE_SCOPE, {
      method: 'POST',
      body: JSON.stringify({ items }),
    });
    return Array.isArray(response) ? response : response.items;
  }

  async commitBatch(batchUuid: string) {
    if (!this.isLive()) return { message: 'mock committed successfully' };
    return this.request<{ message: string }>(
      `/batch-transfer/${batchUuid}/commit/`,
      BATCH_CREATE_SCOPE,
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
      }>(
        `/batch-transfer/${batchUuid}/items/?page_size=1000&page=${page}`,
        BATCH_READ_SCOPE,
      );
      all.push(...response.results);
      if (!response.next) return all;
      page += 1;
    }
  }

  async getBatch(batchUuid: string) {
    if (!this.isLive()) return { uuid: batchUuid, status: 4 };
    return this.request<{ uuid: string; status: number }>(
      `/batch-transfer/${batchUuid}/`,
      BATCH_READ_SCOPE,
    );
  }

  async getTransfer(trackerId: string): Promise<TomanTransferResult> {
    if (!this.isLive()) {
      return {
        uuid: `mock-${trackerId}`,
        status: 6,
        follow_up_code: `MOCK-${trackerId.slice(-10)}`,
      };
    }
    return this.request<TomanTransferResult>(
      `/transfer/tracker/${encodeURIComponent(trackerId)}/`,
      TRANSFER_READ_SCOPE,
    );
  }

  private async request<T>(
    path: string,
    scope: string,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.oauth.fetch(
      `${this.apiUrl()}${path}`,
      scope,
      init,
    );
    if (!response.ok) throw await this.httpError(response, path);
    try {
      const data = (await response.json()) as T;
      const summary = data as { uuid?: string; status?: number };
      tomanLog('corporate.response_parsed', {
        endpoint: path,
        ref: summary?.uuid,
        providerStatus: summary?.status,
      });
      return data;
    } catch (error) {
      tomanLog(
        'corporate.invalid_response',
        { endpoint: path, ...tomanError(error) },
        'error',
      );
      throw error;
    }
  }

  private apiUrl() {
    return (
      process.env.TOMAN_API_URL || 'https://dbank-staging.qcluster.org/api/v1'
    ).replace(/\/$/, '');
  }

  private async httpError(response: Response, path: string) {
    // پاسخ تومان ممکن است جزئیات حساب یا دادهٔ عملیاتی داشته باشد؛ آن را نه در
    // لاگ و نه در پاسخ API خودمان منتشر نمی‌کنیم.
    await response.body?.cancel();
    this.logger.error(`Toman ${path}: HTTP ${response.status}`);
    return new ServiceUnavailableException({
      message: 'ارتباط با بانکداری شرکتی تومان ناموفق بود',
      status: response.status,
    });
  }
}
