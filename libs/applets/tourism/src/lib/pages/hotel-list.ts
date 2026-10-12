import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHotel, lucideMinus, lucidePlane, lucidePlus } from '@ng-icons/lucide';
import { HotelAvailability, HotelSummary, TourismCity } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { HlmSliderImports } from '@sanpay/ui/slider';
import { HlmSwitchImports } from '@sanpay/ui/switch';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { addDays, faNumber, today, toman } from '../format';
import { StayPicker, clampNights, validCheckin } from '../ui/stay-picker';
import { CityPicker } from '../ui/city-picker';
import {
  FilterGroup,
  FilterSheet,
  asArray,
  priceStep,
  toPriceRange,
} from '../ui/filter-sheet';
import {
  HotelCard,
  HotelFilters,
  HotelSort,
  NO_HOTEL_FILTERS,
  activeHotelFilters,
  applyHotelFilters,
  hotelMaxCapacity,
  hotelPriceBounds,
  hotelTypeOptions,
} from './hotel-filters';

@Component({
  selector: 'tourism-hotel-list',
  imports: [
    RouterLink,
    StayPicker,
    NgTemplateOutlet,
    FormsModule,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    CityPicker,
    HlmSkeletonImports,
    HlmSliderImports,
    HlmSwitchImports,
    HlmToggleGroupImports,
    HlmInputGroupImports,
    FilterSheet,
    FilterGroup,
  ],
  viewProviders: [
    provideIcons({ lucideHotel, lucidePlane, lucideMinus, lucidePlus }),
  ],
  templateUrl: './hotel-list.html',
})
export class HotelListPage {
  private readonly tourism = inject(TourismService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;

  protected readonly cities = signal<TourismCity[]>([]);
  protected readonly hotels = signal<HotelCard[]>([]);
  /**
   * با شهر انتخاب‌شده فهرست از جست‌وجوی اتاق خالیِ همان تاریخ می‌آید (فقط
   * هتل‌های دارای اتاق، با «از … ریال»). «همهٔ شهرها» کاتالوگ بی‌قیمت است —
   * جست‌وجوی تاریخ‌دار سراسری در هر دو تأمین‌کننده سنگین است و سرور ردش می‌کند.
   */
  protected readonly dated = computed(() => !!this.cityId());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /**
   * اسکرول تدریجی با `@defer`.
   *
   * «همهٔ شهرها» بیش از هزار هتل برمی‌گرداند و رندر یک‌جای آن‌ها یعنی هزار
   * کارت و هزار درخواست تصویر — روی موبایل غیرقابل استفاده. سرور صفحه‌بندی
   * ندارد، پس کل فهرست یک‌بار می‌آید و همین‌جا به دسته‌های کوچک تقسیم می‌شود؛
   * قالب دستهٔ اول را مستقیم و بقیه را با `@defer (on viewport)` رندر می‌کند.
   */
  private static readonly CHUNK = 12;

  protected readonly chunks = computed(() => {
    const hotels = this.visible();
    const chunks: HotelCard[][] = [];
    for (let i = 0; i < hotels.length; i += HotelListPage.CHUNK) {
      chunks.push(hotels.slice(i, i + HotelListPage.CHUNK));
    }
    return chunks;
  });


  /**
   * شهر، تاریخ و تعداد شب در query string هم می‌نشینند تا back از صفحهٔ هتل
   * یا refresh همان جست‌وجو را برگرداند، نه پیش‌فرض «فردا، یک شب» را.
   */
  /** رشتهٔ خالی = همهٔ شهرها */
  protected readonly cityId = signal(this.query.get('cityId') ?? '');
  protected readonly checkin = signal(
    validCheckin(this.query.get('checkin'), addDays(today(), 1)),
  );
  protected readonly nights = signal(
    clampNights(Number(this.query.get('nights') ?? 1)),
  );

  // ─── فیلترها (باتم‌شیت) ───────────────────────────────────────────
  // روی نتیجهٔ همان جست‌وجو و سمت کاربر اعمال می‌شوند؛ هیچ درخواست تازه‌ای
  // به تأمین‌کننده نمی‌رود.

  protected readonly filters = signal<HotelFilters>(NO_HOTEL_FILTERS);
  protected readonly filtersOpen = signal(false);
  protected readonly visible = computed(() =>
    applyHotelFilters(this.hotels(), this.filters()),
  );
  protected readonly activeFilters = computed(() =>
    activeHotelFilters(this.filters()),
  );
  protected readonly typeOptions = computed(() =>
    hotelTypeOptions(this.hotels(), this.filters().types),
  );
  protected readonly priceBounds = computed(() => hotelPriceBounds(this.hotels()));
  protected readonly priceStep = computed(() => {
    const bounds = this.priceBounds();
    return bounds ? priceStep(bounds[0], bounds[1]) : 1;
  });
  protected readonly priceValue = computed(
    () => this.filters().price ?? this.priceBounds() ?? [0, 0],
  );
  protected readonly maxCapacity = computed(() => hotelMaxCapacity(this.hotels()));
  protected readonly sortOptions = computed<{ value: HotelSort; label: string }[]>(
    () =>
      this.dated()
        ? [
            { value: 'cheap', label: 'ارزان‌ترین' },
            { value: 'expensive', label: 'گران‌ترین' },
            { value: 'stars', label: 'بیشترین ستاره' },
          ]
        : [
            { value: 'cheap', label: 'پیش‌فرض' },
            { value: 'stars', label: 'بیشترین ستاره' },
          ],
  );
  protected readonly starOptions = [5, 4, 3, 2, 1];

  protected setFilter<K extends keyof HotelFilters>(
    key: K,
    value: HotelFilters[K],
  ): void {
    this.filters.update((filters) => ({ ...filters, [key]: value }));
  }

  protected setTypes(value: string | string[] | null | undefined): void {
    this.setFilter('types', asArray(value));
  }

  protected setRates(value: number | number[] | null | undefined): void {
    this.setFilter('rates', asArray(value));
  }

  protected setPrice(value: number[]): void {
    const bounds = this.priceBounds();
    if (bounds) this.setFilter('price', toPriceRange(value, bounds));
  }

  protected stepCapacity(delta: number): void {
    const next = Math.min(
      this.maxCapacity(),
      Math.max(0, this.filters().minCapacity + delta),
    );
    this.setFilter('minCapacity', next);
  }

  protected clearFilters(): void {
    this.filters.update((filters) => ({ ...NO_HOTEL_FILTERS, sort: filters.sort }));
  }

  /** هتل‌هایی که تصویرشان لود نشد — به‌جای کادر خالی، آیکون جایگزین می‌گیرند */
  protected readonly brokenImages = signal(new Set<string>());

  constructor() {
    // شهر، تاریخ یا تعداد شب عوض شد → دوباره بگیر
    effect(() => {
      this.cityId();
      this.checkin();
      this.nights();
      untracked(() => void this.load());
    });
    effect(() => {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          cityId: this.cityId() || null,
          checkin: this.checkin(),
          nights: this.nights(),
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });
  }

  /** شمارهٔ آخرین درخواست — پاسخ کهنهٔ شهر قبلی روی شهر تازه ننشیند */
  private loadId = 0;

  protected async load(): Promise<void> {
    const id = ++this.loadId;
    const cityId = this.cityId();
    this.loading.set(true);
    this.error.set(null);
    try {
      if (cityId) {
        // استپر شب چند تغییر پشت‌سرهم می‌سازد — یک جست‌وجو کافی است
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (id !== this.loadId) return;
      }
      const [cities, hotels] = await Promise.all([
        this.cities().length > 0
          ? Promise.resolve(this.cities())
          : firstValueFrom(this.tourism.cities()),
        cityId
          ? firstValueFrom(
              this.tourism.search({
                cityId,
                checkin: this.checkin(),
                nights: this.nights(),
                rate: 0,
                // همان ظرفیتی که صفحهٔ هتل برای اتاق‌ها می‌پرسد، تا هتلی که
                // اینجا هست آنجا خالی درنیاید
                capacity: 2,
              }),
            )
          : firstValueFrom(this.tourism.hotels()),
      ]);
      if (id !== this.loadId) return;
      this.cities.set(cities);
      const cityName = cities.find((city) => city.id === cityId)?.name ?? '';
      this.hotels.set(
        cityId
          ? (hotels as HotelAvailability[]).map((availability) =>
              fromAvailability(availability, cityId, cityName),
            )
          : (hotels as HotelSummary[]),
      );
      // لبه‌های اسلایدر قیمت با هر جست‌وجو عوض می‌شوند؛ بازهٔ قبلی دیگر معنا ندارد
      this.setFilter('price', null);
      if (!cityId && this.filters().sort === 'expensive') {
        this.setFilter('sort', 'cheap');
      }
    } catch {
      if (id === this.loadId) this.error.set('دریافت فهرست هتل‌ها ناموفق بود');
    } finally {
      if (id === this.loadId) this.loading.set(false);
    }
  }

  protected onCityChange(value: string | null | undefined): void {
    this.cityId.set(value ?? '');
  }

  /** تاریخ و تعداد شب در query param می‌روند تا صفحهٔ هتل هم قابل اشتراک باشد */
  protected openHotel(hotel: HotelCard): void {
    void this.router.navigate(['/tourism/hotels', hotel.id], {
      queryParams: { checkin: this.checkin(), nights: this.nights() },
    });
  }

  protected markBroken(hotelId: string): void {
    this.brokenImages.update((set) => new Set(set).add(hotelId));
  }

  protected stars(rate: number): number[] {
    return Array.from({ length: rate }, (_, index) => index);
  }

  protected readonly count = faNumber;
  protected readonly money = toman;
}

function fromAvailability(
  availability: HotelAvailability,
  cityId: string,
  cityName: string,
): HotelCard {
  return {
    id: availability.hotelId,
    name: availability.hotelName,
    rate: availability.rate ?? 0,
    type: availability.type ?? '',
    cityId,
    cityName,
    address: availability.address ?? '',
    photo: availability.photo ?? null,
    rooms: availability.rooms,
    fromPrice: Math.min(...availability.rooms.map((room) => room.price)),
  };
}
