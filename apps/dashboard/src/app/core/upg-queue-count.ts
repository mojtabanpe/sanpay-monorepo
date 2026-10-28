import { Service, inject, signal } from '@angular/core';
import { AdminAuthService } from './admin-auth.service';
import { AdminApiService } from './admin-api.service';

/**
 * تعداد موارد صف «بررسی دستی درگاه» برای شمارندهٔ منو. پوسته با هر
 * جابه‌جایی صفحه و صفحه‌های بررسی بعد از هر تصمیم `refresh()` می‌کنند؛
 * خطا شمارنده را دست‌نخورده می‌گذارد — منو نباید به‌خاطرش خطا نشان دهد.
 */
@Service()
export class UpgQueueCount {
  private readonly auth = inject(AdminAuthService);
  private readonly api = inject(AdminApiService);
  private inFlight = false;

  readonly total = signal(0);

  async refresh(): Promise<void> {
    if (!this.auth.hasPermission('upg-review:read')) {
      this.total.set(0);
      return;
    }
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      this.total.set((await this.api.upgReviewCount()).total);
    } catch {
      // شمارنده کمکی است
    } finally {
      this.inFlight = false;
    }
  }
}
