import { Component, computed, input, model, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronDown, lucideSearch } from '@ng-icons/lucide';
import { FlightAirport } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { normalizeCityName } from './city-picker';

const SHORT_NAMES: Record<string, string> = {
  THR: 'تهران · مهرآباد',
  IKA: 'تهران · امام خمینی',
  MHD: 'مشهد',
  SYZ: 'شیراز',
  IFN: 'اصفهان',
  KIH: 'کیش',
  TBZ: 'تبریز',
  KER: 'کرمان',
};

/** نام کوتاه فرودگاه برای نمایش؛ «فرودگاه بین‌المللی» از ابتدای نام حذف می‌شود. */
export function airportShortName(
  iata: string,
  airports: readonly FlightAirport[],
): string {
  const name = airports.find((a) => a.iata === iata)?.name ?? iata;
  return (
    SHORT_NAMES[iata] ?? name.replace(/^فرودگاه\s+(بین[‌ ]المللی\s+)?/, '')
  );
}

/**
 * انتخاب فرودگاه در باتم‌شیت با جست‌وجو — همان الگوی `CityPicker`
 * (بدون فوکوس خودکار، تا کیبورد آیفون فهرست را نپوشاند).
 * جست‌وجو روی نام کامل، نام کوتاه و کد IATA انجام می‌شود.
 */
@Component({
  selector: 'tourism-airport-picker',
  imports: [NgIcon, HlmButtonImports, HlmInputGroupImports, HlmSheetImports],
  providers: [provideIcons({ lucideCheck, lucideChevronDown, lucideSearch })],
  template: `
    <button
      hlmBtn
      variant="outline"
      type="button"
      class="h-12 w-full justify-between rounded-xl text-sm font-medium"
      [id]="buttonId()"
      aria-haspopup="dialog"
      (click)="open.set(true)"
    >
      <span class="truncate" [class.text-muted-foreground]="!value()">
        {{ value() ? shortName(value()) : placeholder() }}
      </span>
      <ng-icon
        name="lucideChevronDown"
        class="text-muted-foreground shrink-0"
        aria-hidden="true"
      />
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
            فرودگاه را از فهرست انتخاب کنید یا نام شهر یا کد آن را بنویسید.
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
              placeholder="نام شهر، فرودگاه یا کد…"
              aria-label="جست‌وجوی فرودگاه"
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
          @for (airport of filtered(); track airport.iata) {
            <li>
              <button
                type="button"
                role="option"
                class="hover:bg-muted flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 text-start text-sm"
                [attr.aria-selected]="value() === airport.iata"
                (click)="pick(airport.iata)"
              >
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="truncate font-medium">{{
                    shortName(airport.iata)
                  }}</span>
                  <span class="text-muted-foreground truncate text-xs">{{
                    airport.name
                  }}</span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <bdi class="text-muted-foreground text-xs" dir="ltr">{{
                    airport.iata
                  }}</bdi>
                  @if (value() === airport.iata) {
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
              فرودگاهی پیدا نشد
            </li>
          }
        </ul>
      </hlm-sheet-content>
    </hlm-sheet>
  `,
})
export class AirportPicker {
  readonly airports = input.required<FlightAirport[]>();
  /** کد IATA؛ رشتهٔ خالی = انتخاب‌نشده */
  readonly value = model('');
  readonly buttonId = input('airport-picker-trigger');
  readonly title = input('انتخاب فرودگاه');
  readonly placeholder = input('انتخاب فرودگاه');

  protected readonly open = signal(false);
  protected readonly search = signal('');
  protected readonly filtered = computed(() => {
    const raw = this.search().trim();
    const airports = this.airports();
    if (!raw) return airports;
    const query = normalizeCityName(raw);
    const code = raw.toUpperCase();
    return airports.filter(
      (a) =>
        a.iata.startsWith(code) ||
        normalizeCityName(a.name).includes(query) ||
        normalizeCityName(airportShortName(a.iata, airports)).includes(query),
    );
  });

  protected shortName(iata: string): string {
    return airportShortName(iata, this.airports());
  }

  protected pick(iata: string): void {
    this.value.set(iata);
    this.open.set(false);
  }

  protected onStateChange(state: string): void {
    if (state === 'closed') {
      this.open.set(false);
      this.search.set('');
    }
  }
}
