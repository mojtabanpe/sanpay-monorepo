import {
  DestroyRef,
  Directive,
  ElementRef,
  effect,
  inject,
  input,
} from '@angular/core';

/**
 * عدد را از مقدار قبلی (بار اول صفر) تا مقدار جدید می‌شمارد و متن المان را
 * با `format` می‌نویسد. فقط `textContent` عوض می‌شود، پس برای صفحه‌خوان‌ها
 * `aria-label` جداگانه با مقدار نهایی لازم نیست: وقتی شمارش تمام شد متن
 * دقیقاً همان است که بدون انیمیشن می‌بود.
 *
 * ```html
 * <p [appCountUp]="wallet.remaining" [countUpFormat]="toman"></p>
 * ```
 */
@Directive({ selector: '[appCountUp]' })
export class CountUp {
  readonly appCountUp = input.required<number>();
  readonly countUpFormat = input<(value: number) => string>((value) =>
    String(value),
  );
  readonly countUpDuration = input(700);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private current = 0;
  private frame = 0;

  constructor() {
    effect(() => {
      const target = this.appCountUp();
      const format = this.countUpFormat();
      const duration = this.countUpDuration();
      this.animate(target, format, duration);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private animate(
    target: number,
    format: (value: number) => string,
    duration: number,
  ): void {
    cancelAnimationFrame(this.frame);
    const element = this.host.nativeElement;
    const from = this.current;
    const reduced =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || from === target || duration <= 0) {
      this.current = target;
      element.textContent = format(target);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      // easeOutCubic — تند شروع می‌شود و آرام روی عدد نهایی می‌نشیند
      const eased = 1 - Math.pow(1 - progress, 3);
      this.current = Math.round(from + (target - from) * eased);
      element.textContent = format(this.current);
      if (progress < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}
