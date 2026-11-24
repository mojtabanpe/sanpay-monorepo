import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideChevronDown,
  lucideSearch,
} from '@ng-icons/lucide';
import { COUNTRIES, countryByCode } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSheetImports } from '@sanpay/ui/sheet';

function normalizePersian(value: string): string {
  return value
    .trim()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/**
 * انتخاب کشور (تابعیت یا صادرکنندهٔ گذرنامه) در باتم‌شیت با جست‌وجو —
 * همان الگوی `AirportPicker` و `CityPicker` بدون فوکوس خودکار.
 */
@Component({
  selector: 'tourism-country-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIcon, HlmButtonImports, HlmInputGroupImports, HlmSheetImports],
  providers: [provideIcons({ lucideCheck, lucideChevronDown, lucideSearch })],
  template: `
    <button
      hlmBtn
      variant="outline"
      type="button"
      class="h-12 w-full justify-between rounded-xl text-sm font-medium"
      [id]="buttonId()"
      [disabled]="disabled()"
      aria-haspopup="dialog"
      (click)="open.set(true)"
    >
      <span class="truncate" [class.text-muted-foreground]="!selectedLabel()">
        {{ selectedLabel() || placeholder() }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5">
        @if (normalizedValue()) {
          <bdi class="text-muted-foreground text-xs" dir="ltr">{{
            normalizedValue()
          }}</bdi>
        }
        <ng-icon
          name="lucideChevronDown"
          class="text-muted-foreground shrink-0"
          aria-hidden="true"
        />
      </span>
    </button>

    <hlm-sheet
      side="bottom"
      closeOnOutsidePointerEvents
      [autoFocus]="false"
      [state]="open() ? 'open' : 'closed'"
      (stateChanged)="onStateChange($event)"
    >
      <hlm-sheet-content
        *hlmSheetPortal
        class="max-h-[85dvh] min-h-[85dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <div hlmSheetHeader>
          <h2 hlmSheetTitle>{{ title() }}</h2>
          <p hlmSheetDescription class="sr-only">
            کشور را از فهرست انتخاب کنید یا نام فارسی، انگلیسی یا کد دوحرفی آن
            را جست‌وجو کنید.
          </p>
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
              placeholder="نام کشور یا کد (مثلاً ایران، IR)…"
              aria-label="جست‌وجوی کشور"
              [value]="search()"
              (input)="search.set($any($event.target).value)"
            />
          </hlm-input-group>
        </div>

        <ul
          class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2"
          role="listbox"
          [attr.aria-label]="title()"
        >
          @for (country of filtered(); track country.code) {
            <li>
              <button
                type="button"
                role="option"
                class="hover:bg-muted flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm"
                [attr.aria-selected]="normalizedValue() === country.code"
                (click)="pick(country.code)"
              >
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate font-medium">{{ country.nameFa }}</span>
                  <span class="text-muted-foreground truncate text-xs" dir="ltr">
                    {{ country.nameEn }}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <bdi class="text-muted-foreground text-xs" dir="ltr">{{
                    country.code
                  }}</bdi>
                  @if (normalizedValue() === country.code) {
                    <ng-icon
                      name="lucideCheck"
                      class="text-primary"
                      aria-hidden="true"
                    />
                  }
                </span>
              </button>
            </li>
          } @empty {
            <li class="text-muted-foreground py-8 text-center text-sm">
              کشوری پیدا نشد
            </li>
          }
        </ul>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class CountryPicker {
  /** کد ISO alpha-2 (مثلاً IR) */
  readonly value = model('');
  readonly buttonId = input('country-picker-trigger');
  readonly title = input('انتخاب کشور');
  readonly placeholder = input('انتخاب کشور');
  readonly disabled = input(false);

  protected readonly open = signal(false);
  protected readonly search = signal('');

  protected readonly normalizedValue = computed(() =>
    this.value().trim().toUpperCase(),
  );

  protected readonly selectedLabel = computed(() => {
    const code = this.normalizedValue();
    if (!code) return '';
    return countryByCode(code)?.nameFa ?? code;
  });

  protected readonly filtered = computed(() => {
    const raw = this.search().trim();
    if (!raw) return COUNTRIES;
    const query = normalizePersian(raw);
    const code = raw.toUpperCase();
    return COUNTRIES.filter(
      (c) =>
        c.code.startsWith(code) ||
        normalizePersian(c.nameFa).includes(query) ||
        c.nameEn.toLowerCase().includes(query),
    );
  });

  protected pick(code: string): void {
    this.value.set(code);
    this.open.set(false);
  }

  protected onStateChange(state: string): void {
    if (state === 'closed') {
      this.open.set(false);
      this.search.set('');
    }
  }
}
