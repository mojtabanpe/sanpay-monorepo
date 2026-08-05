import { Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * پاپ‌اور `hlm-date-picker` را هم‌عرض خودِ فیلد باز می‌کند.
 *
 * چرا با دستور و نه فقط CSS: محتوای پاپ‌اور داخل یک overlay از CDK رندر می‌شود،
 * نه زیر همین المان، پس CSS راهی ندارد عرض trigger را بفهمد. spartan هم — برخلاف
 * `brn-select` که `updateTriggerWidth` دارد — برای popover چنین چیزی نمی‌دهد.
 * این دستور عرض میزبان را با ResizeObserver دنبال می‌کند و روی
 * `--sanpay-date-picker-width` در ریشهٔ سند می‌نویسد؛ قاعده‌اش در glass.css است.
 *
 * نوشتن روی ریشهٔ سند امن است چون هر لحظه فقط یک پاپ‌اور تاریخ باز است، و
 * مقدار پیش از هر باز شدن دوباره به‌روز می‌شود.
 *
 * ```html
 * <hlm-date-picker sanpayDatePickerWidth [date]="…">
 *   <hlm-date-picker-trigger class="w-full">انتخاب تاریخ</hlm-date-picker-trigger>
 * </hlm-date-picker>
 * ```
 */
@Directive({
  selector: '[sanpayDatePickerWidth]',
  host: {
    '(click)': 'publish()',
    '(keydown.enter)': 'publish()',
    '(keydown.space)': 'publish()',
  },
})
export class SanpayDatePickerWidth implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly observer = new ResizeObserver(() => this.publish());

  constructor() {
    this.observer.observe(this.host.nativeElement);
  }

  /**
   * روی رویدادهای باز شدن هم صدا زده می‌شود: ResizeObserver وقتی عرض عوض نشده
   * چیزی نمی‌دهد، و اگر بین دو بار باز شدن، date-picker دیگری مقدار را
   * بازنویسی کرده باشد، همین‌جا اصلاح می‌شود.
   */
  protected publish(): void {
    const width = this.host.nativeElement.getBoundingClientRect().width;
    if (width > 0) {
      document.documentElement.style.setProperty(
        '--sanpay-date-picker-width',
        `${width}px`,
      );
    }
  }

  ngOnDestroy(): void {
    this.observer.disconnect();
  }
}
