import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

/**
 * ساعت و تاریخ زنده با لوگوی فروشگاه (لوگو از «فروشگاه‌ها»ی داشبورد).
 * ساعت از ساعت خود دستگاه تیک می‌خورد — فقط برای نمایش است.
 */
@Component({
  selector: 'store-clock-card',
  template: `
    <div
      class="bg-card flex items-center gap-4 rounded-(--radius-lg) border px-4 py-2.5 shadow-(--elev-1)"
    >
      <div class="leading-tight">
        <p
          class="text-2xl font-bold tracking-tight tabular-nums"
          dir="ltr"
          aria-live="off"
        >
          {{ time() }}
        </p>
        <p class="text-muted-foreground mt-0.5 text-xs">{{ date() }}</p>
      </div>
      <div class="bg-border h-10 w-px" aria-hidden="true"></div>
      @if (logoUrl(); as logo) {
        <img
          [src]="logo"
          [alt]="'لوگوی ' + name()"
          class="size-12 shrink-0 rounded-xl object-contain"
        />
      } @else {
        <div
          class="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
          aria-hidden="true"
        >
          {{ initial() }}
        </div>
      }
    </div>
  `,
})
export class ClockCard {
  readonly logoUrl = input<string | null | undefined>(null);
  readonly name = input<string | undefined>('');

  private readonly now = signal(new Date());
  private readonly timeFormat = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Tehran',
  });
  private readonly dateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  });

  protected readonly time = computed(() => this.timeFormat.format(this.now()));
  protected readonly date = computed(() => this.dateFormat.format(this.now()));
  protected readonly initial = computed(() =>
    (this.name() ?? '').trim().charAt(0),
  );

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
