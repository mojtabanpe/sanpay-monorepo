import { Component, input, model, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSlidersHorizontal } from '@ng-icons/lucide';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { faNumber } from '../format';

/**
 * دکمهٔ «فیلترها» + باتم‌شیتِ فیلتر، مشترک بین فهرست هتل و پرواز.
 *
 * کنترل‌های هر صفحه با content projection داخل شیت می‌نشینند؛ این کامپوننت
 * فقط قاب را می‌دهد: عنوان، بدنهٔ اسکرول‌شونده و فوتر «نمایش N نتیجه» /
 * «پاک کردن». فیلترها زنده اعمال می‌شوند، پس دکمهٔ نمایش فقط شیت را می‌بندد و
 * تعداد روی آن همیشه همان چیزی است که پشت شیت دیده خواهد شد.
 */
@Component({
  selector: 'tourism-filter-sheet',
  imports: [NgIcon, HlmButtonImports, HlmSheetImports],
  providers: [provideIcons({ lucideSlidersHorizontal })],
  template: `
    <button
      hlmBtn
      variant="outline"
      type="button"
      class="min-h-11 gap-2 rounded-xl"
      [attr.aria-label]="
        activeCount() ? 'فیلترها، ' + count(activeCount()) + ' فیلتر فعال' : 'فیلترها'
      "
      (click)="open.set(true)"
    >
      <ng-icon name="lucideSlidersHorizontal" aria-hidden="true" />
      فیلترها
      @if (activeCount()) {
        <span
          class="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full text-[11px] font-bold"
          aria-hidden="true"
          >{{ count(activeCount()) }}</span
        >
      }
    </button>

    <hlm-sheet
      side="bottom"
      closeOnOutsidePointerEvents
      [state]="open() ? 'open' : 'closed'"
      (stateChanged)="$event === 'closed' && open.set(false)"
    >
      <hlm-sheet-content
        *hlmSheetPortal
        class="max-h-[85dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div hlmSheetHeader>
          <h2 hlmSheetTitle>{{ title() }}</h2>
          <p hlmSheetDescription>نتیجه‌ها همزمان با انتخاب شما به‌روز می‌شوند.</p>
        </div>

        <div
          class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4"
        >
          <ng-content />
        </div>

        <div hlmSheetFooter class="flex-row border-t" style="border-color: var(--hairline)">
          <button hlmBtn type="button" class="flex-1" (click)="open.set(false)">
            @if (resultCount() > 0) {
              نمایش {{ count(resultCount()) }} نتیجه
            } @else {
              نتیجه‌ای با این فیلترها نیست
            }
          </button>
          <button
            hlmBtn
            variant="ghost"
            type="button"
            [disabled]="!activeCount()"
            (click)="clear.emit()"
          >
            پاک کردن
          </button>
        </div>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class FilterSheet {
  readonly title = input('فیلترها');
  /** تعداد نتیجه‌ها پس از اعمال فیلترهای فعلی */
  readonly resultCount = input.required<number>();
  /** تعداد فیلترهای فعال — مرتب‌سازی جزوش نیست */
  readonly activeCount = input.required<number>();
  readonly open = model(false);
  readonly clear = output<void>();

  protected readonly count = faNumber;
}

/** یک گروه فیلتر داخل شیت: عنوان + کنترل‌ها */
@Component({
  selector: 'tourism-filter-group',
  host: { class: 'flex flex-col gap-3', role: 'group', '[attr.aria-label]': 'label()' },
  template: `
    <div class="flex items-baseline justify-between gap-2">
      <h3 class="text-sm font-semibold">{{ label() }}</h3>
      @if (hint()) {
        <span class="text-muted-foreground text-xs">{{ hint() }}</span>
      }
    </div>
    <ng-content />
  `,
})
export class FilterGroup {
  readonly label = input.required<string>();
  readonly hint = input('');
}

/** گام «رُند» برای اسلایدر قیمت: حدود ۵۰ گام بین کمینه و بیشینه */
export function priceStep(min: number, max: number): number {
  const raw = Math.max(1, (max - min) / 50);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(raw / magnitude) * magnitude;
}

/** بازهٔ قیمت؛ null یعنی فیلتر قیمت فعال نیست */
export type PriceRange = readonly [number, number] | null;

/**
 * مقدار اسلایدر را به فیلتر تبدیل می‌کند: اگر هر دو سر روی لبه‌ها باشند، فیلتر
 * خاموش است (null) — وگرنه «فعال» شمرده می‌شد بی‌آنکه چیزی را حذف کند.
 */
export function toPriceRange(
  value: readonly number[],
  bounds: readonly [number, number],
): PriceRange {
  const [lo, hi] = value;
  return lo <= bounds[0] && hi >= bounds[1] ? null : [lo, hi];
}

/** افزودن/برداشتن یک مقدار از آرایه‌ای که toggle-group چندتایی می‌دهد */
export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}
