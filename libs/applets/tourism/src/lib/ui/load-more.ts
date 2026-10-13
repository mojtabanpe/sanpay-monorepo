import { Component, afterNextRender, input, output } from '@angular/core';
import { HlmButtonImports } from '@sanpay/ui/button';

/**
 * انتهای فهرست صفحه‌بندی‌شده. داخل `@defer (on viewport)` گذاشته می‌شود: همین
 * که به دید رسید و رندر شد، `appear` صفحهٔ بعد را می‌خواهد — بدون
 * IntersectionObserver دست‌ساز. دکمه برای صفحه‌کلید و وقتی بارگذاری خودکار
 * خطا داد می‌ماند.
 */
@Component({
  selector: 'tourism-load-more',
  imports: [HlmButtonImports],
  template: `
    <div class="flex justify-center py-2">
      <button
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="loading()"
        (click)="appear.emit()"
      >
        {{ loading() ? 'در حال بارگذاری…' : 'نمایش بیشتر' }}
      </button>
    </div>
  `,
})
export class LoadMore {
  readonly loading = input(false);
  readonly appear = output<void>();

  constructor() {
    afterNextRender(() => this.appear.emit());
  }
}
