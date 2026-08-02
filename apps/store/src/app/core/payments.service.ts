import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Receipt } from '@sanpay/models';
import { firstValueFrom } from 'rxjs';
import { StoreAuthService } from './store-auth.service';

@Injectable({ providedIn: 'root' })
export class StorePaymentsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(StoreAuthService);

  recent(): Promise<Receipt[]> {
    return firstValueFrom(this.http.get<Receipt[]>('/api/store/payments'));
  }

  /**
   * استریم زندهٔ رسیدها.
   *
   * از `fetch` استفاده می‌کنیم نه `EventSource`، چون EventSource هدر
   * Authorization نمی‌فرستد و تنها راهش گذاشتن توکن در URL است — توکن در URL
   * در لاگ سرور و پروکسی ثبت می‌شود. تابع برگشتی، اتصال را می‌بندد.
   */
  stream(
    onReceipt: (receipt: Receipt) => void,
    onStatus?: (connected: boolean) => void,
  ): () => void {
    let closed = false;
    let retryDelay = 1_000;
    let controller = new AbortController();

    const connect = async (): Promise<void> => {
      if (closed) return;
      controller = new AbortController();

      // اگر بک‌اند بمیرد، پروکسی توسعه اتصال را باز نگه می‌دارد و هیچ خطایی
      // نمی‌دهد — پس سکوت را خودمان تشخیص می‌دهیم: سرور هر ۲۵ ثانیه ping
      // می‌فرستد، اگر ۶۰ ثانیه هیچ فریمی نرسد اتصال را مرده می‌گیریم.
      let watchdog: ReturnType<typeof setTimeout> | null = null;
      const resetWatchdog = () => {
        if (watchdog !== null) clearTimeout(watchdog);
        watchdog = setTimeout(() => controller.abort(), 60_000);
      };

      try {
        const response = await fetch('/api/store/payments/stream', {
          headers: { Authorization: `Bearer ${this.auth.token ?? ''}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`stream failed: ${response.status}`);
        }

        onStatus?.(true);
        retryDelay = 1_000;
        resetWatchdog();

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          resetWatchdog();
          buffer += value;

          // فریم‌های SSE با یک خط خالی از هم جدا می‌شوند
          let separator = buffer.indexOf('\n\n');
          while (separator !== -1) {
            this.handleFrame(buffer.slice(0, separator), onReceipt);
            buffer = buffer.slice(separator + 2);
            separator = buffer.indexOf('\n\n');
          }
        }
      } catch {
        // قطع اتصال — پایین‌تر دوباره وصل می‌شویم
      } finally {
        if (watchdog !== null) clearTimeout(watchdog);
      }

      if (closed) return;
      onStatus?.(false);
      // تلاش مجدد با فاصلهٔ فزاینده تا سقف ۱۵ ثانیه
      setTimeout(() => void connect(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    };

    void connect();

    return () => {
      closed = true;
      controller.abort();
    };
  }

  private handleFrame(frame: string, onReceipt: (receipt: Receipt) => void): void {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }

    if (event !== 'payment' || dataLines.length === 0) return;
    try {
      onReceipt(JSON.parse(dataLines.join('\n')) as Receipt);
    } catch {
      // فریم ناقص — نادیده
    }
  }
}
