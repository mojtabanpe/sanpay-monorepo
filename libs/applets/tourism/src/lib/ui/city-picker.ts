import { Component, computed, input, model, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideSearch } from '@ng-icons/lucide';
import { TourismCity } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSheetImports } from '@sanpay/ui/sheet';

/**
 * انتخاب شهر در باتم‌شیت.
 *
 * جایگزین `hlm-combobox`: popover آن هنگام باز شدن فوکوس را به کادر جست‌وجو
 * می‌برد (`autoFocus` پیش‌فرض brain)، روی آیفون کیبورد بالا می‌آمد و فهرست
 * ۲۸۸ پیکسلیِ زیر فیلد پشت کیبورد می‌ماند — کشیدن انگشت صفحهٔ پشت را اسکرول
 * می‌کرد، نه فهرست را. اینجا فوکوس خودکار نیست، پس کیبورد فقط با لمس جست‌وجو
 * باز می‌شود و فهرست بیشتر ارتفاع صفحه را دارد.
 */
@Component({
  selector: 'tourism-city-picker',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmInputGroupImports,
    HlmSheetImports,
  ],
  providers: [provideIcons({ lucideCheck, lucideChevronDown, lucideSearch })],
  template: `
    <button
      hlmBtn
      variant="outline"
      type="button"
      class="w-full justify-between"
      [id]="buttonId()"
      aria-haspopup="dialog"
      (click)="open.set(true)"
    >
      <span class="truncate">{{ label(value()) }}</span>
      <ng-icon name="lucideChevronDown" class="text-muted-foreground" aria-hidden="true" />
    </button>

    <hlm-sheet
      side="bottom"
      closeOnOutsidePointerEvents
      [autoFocus]="false"
      [state]="open() ? 'open' : 'closed'"
      (stateChanged)="onStateChange($event)"
    >
      <!-- ارتفاع ثابت (min = max) تا با تایپ در جست‌وجو و کوتاه شدن فهرست، شیت
           بالا و پایین نپرد. h-[…] کار نمی‌کند: data-[side=bottom]:h-auto اسپارتن
           برنده است، ولی min/max-height بر height می‌چربند. -->
      <hlm-sheet-content
        *hlmSheetPortal
        class="max-h-[85dvh] min-h-[85dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div hlmSheetHeader>
          <h2 hlmSheetTitle>انتخاب شهر</h2>
          <p hlmSheetDescription class="sr-only">شهر را از فهرست انتخاب کنید یا نامش را بنویسید.</p>
        </div>

        <div class="px-4">
          <hlm-input-group>
            <hlm-input-group-addon align="inline-start">
              <ng-icon name="lucideSearch" aria-hidden="true" />
            </hlm-input-group-addon>
            <input
              hlmInputGroupInput
              type="search"
              enterkeyhint="search"
              placeholder="نام شهر را بنویسید…"
              aria-label="جست‌وجوی شهر"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
          </hlm-input-group>
        </div>

        <ul
          class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2"
          role="listbox"
          aria-label="شهرها"
        >
          @if (!search()) {
            <li>
              <button
                type="button"
                role="option"
                class="hover:bg-muted flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm"
                [attr.aria-selected]="value() === ''"
                (click)="pick('')"
              >
                همهٔ شهرها
                @if (value() === '') {
                  <ng-icon name="lucideCheck" class="text-primary" aria-hidden="true" />
                }
              </button>
            </li>
          }
          @for (city of filtered(); track city.id) {
            <li>
              <button
                type="button"
                role="option"
                class="hover:bg-muted flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm"
                [attr.aria-selected]="value() === city.id"
                (click)="pick(city.id)"
              >
                {{ city.name }}
                @if (value() === city.id) {
                  <ng-icon name="lucideCheck" class="text-primary" aria-hidden="true" />
                }
              </button>
            </li>
          } @empty {
            @if (search()) {
              <li class="text-muted-foreground py-8 text-center text-sm">شهری پیدا نشد</li>
            }
          }
        </ul>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class CityPicker {
  readonly cities = input.required<TourismCity[]>();
  /** شناسهٔ شهر؛ رشتهٔ خالی = همهٔ شهرها */
  readonly value = model('');
  readonly buttonId = input('city-picker-trigger');

  protected readonly open = signal(false);
  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const query = normalizeCityName(this.search());
    const cities = this.cities();
    return query
      ? cities.filter((city) => normalizeCityName(city.name).includes(query))
      : cities;
  });

  protected label(id: string): string {
    return id
      ? (this.cities().find((city) => city.id === id)?.name ?? '')
      : 'همهٔ شهرها';
  }

  protected pick(id: string): void {
    this.value.set(id);
    this.open.set(false);
  }

  protected onStateChange(state: string): void {
    if (state === 'closed') {
      this.open.set(false);
      this.search.set('');
    }
  }
}

/** Match Persian and Arabic keyboard variants, spacing and optional diacritics. */
export function normalizeCityName(value: string): string {
  return value
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/آ/g, 'ا')
    .replace(/[ً-ٰٟـ‌\s]/g, '')
    .toLocaleLowerCase('fa');
}
