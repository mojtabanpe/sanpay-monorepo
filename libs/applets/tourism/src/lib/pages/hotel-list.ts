import {
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideHotel,
  lucideMinus,
  lucidePlane,
  lucidePlus,
  lucideSearch,
  lucideX,
} from '@ng-icons/lucide';
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
  HotelFacets,
  HotelFilters,
  HotelSort,
  MIN_HOTEL_STARS,
  NO_HOTEL_FILTERS,
  TourismCity,
  activeHotelFilters,
} from '@sanpay/models';
import { LoadMore } from '../ui/load-more';

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
    LoadMore,
  ],
  viewProviders: [
    provideIcons({
      lucideHotel,
      lucidePlane,
      lucideMinus,
      lucidePlus,
      lucideSearch,
      lucideX,
    }),
  ],
  templateUrl: './hotel-list.html',
})
export class HotelListPage {
  private readonly tourism = inject(TourismService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;

  protected readonly cities = signal<TourismCity[]>([]);
  /** کارت‌های صفحه‌های بارشده — فیلتر و مرتب‌سازی را سرور روی کل نتیجه انجام داده */
  protected readonly hotels = signal<HotelCard[]>([]);
  /** تعداد بعد از فیلتر / پیش از فیلتر، از سرور */
  protected readonly total = signal(0);
  protected readonly unfilteredTotal = signal(0);
  private readonly facets = signal<HotelFacets>({
    types: [],
    priceBounds: null,
    maxCapacity: 0,
  });
  private page = 0;
  protected readonly hasMore = computed(
    () => this.hotels().length < this.total(),
  );
  protected readonly loadingMore = signal(false);
  /**
   * با شهر انتخاب‌شده فهرست از جست‌وجوی اتاق خالیِ همان تاریخ می‌آید (فقط
   * هتل‌های دارای اتاق، با «از … ریال»). «همهٔ شهرها» کاتالوگ بی‌قیمت است —
   * جست‌وجوی تاریخ‌دار سراسری در هر دو تأمین‌کننده سنگین است و سرور ردش می‌کند.
   */
  protected readonly dated = computed(() => !!this.cityId());
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /**
   * صفحه‌بندی سمت سرور: نتیجهٔ کامل (با پروداکشنِ هتل‌یار حدود ۱ مگابایت، ۹۷٪
   * آن فهرست اتاق‌ها) فقط در سرور می‌ماند و هر صفحه ۲۰ کارت بی‌اتاق است.
   */
  private static readonly PAGE_SIZE = 20;

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
  // سمت سرور، روی نتیجهٔ کشِ همان جست‌وجو؛ هیچ درخواست تازه‌ای به تأمین‌کننده
  // نمی‌رود.

  /**
   * با عوض شدن شهر یا تاریخ لبه‌های اسلایدر قیمت عوض می‌شوند و بازهٔ قبلی
   * معنا ندارد؛ کاتالوگ «همهٔ شهرها» هم «گران‌ترین» ندارد. `linkedSignal`
   * این بازنشانی را در همان تیکِ تغییر شهر انجام می‌دهد، پس یک درخواست می‌رود نه دو.
   */
  protected readonly filters = linkedSignal<
    { city: string; checkin: string; nights: number },
    HotelFilters
  >({
    source: () => ({
      city: this.cityId(),
      checkin: this.checkin(),
      nights: this.nights(),
    }),
    computation: (source, previous) => {
      if (!previous) return NO_HOTEL_FILTERS;
      const sort =
        !source.city && previous.value.sort === 'expensive'
          ? 'cheap'
          : previous.value.sort;
      return { ...previous.value, price: null, sort };
    },
  });
  protected readonly filtersOpen = signal(false);
  protected readonly visible = this.hotels.asReadonly();
  protected readonly activeFilters = computed(() =>
    activeHotelFilters(this.filters()),
  );
  protected readonly typeOptions = computed(() => this.facets().types);
  protected readonly priceBounds = computed(() => this.facets().priceBounds);
  protected readonly priceStep = computed(() => {
    const bounds = this.priceBounds();
    return bounds ? priceStep(bounds[0], bounds[1]) : 1;
  });
  protected readonly priceValue = computed(
    () => this.filters().price ?? this.priceBounds() ?? [0, 0],
  );
  protected readonly maxCapacity = computed(() => this.facets().maxCapacity);
  protected readonly sortOptions = computed<
    { value: HotelSort; label: string }[]
  >(() =>
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
  /** فقط ۳ ستاره به بالا — زیر آن را سرور اصلاً برنمی‌گرداند */
  protected readonly starOptions = [5, 4, 3, 2, 1].filter(
    (rate) => rate >= MIN_HOTEL_STARS,
  );

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

  /** جست‌وجوی نام کادر جدای خودش را دارد و با «پاک کردن فیلترها» نمی‌رود */
  protected clearFilters(): void {
    this.filters.update((filters) => ({
      ...NO_HOTEL_FILTERS,
      sort: filters.sort,
      query: filters.query,
    }));
  }

  /** هتل‌هایی که تصویرشان لود نشد — به‌جای کادر خالی، آیکون جایگزین می‌گیرند */
  protected readonly brokenImages = signal(new Set<string>());

  constructor() {
    // شهر، تاریخ، تعداد شب یا فیلتر عوض شد → صفحهٔ اول از نو
    effect(() => {
      this.cityId();
      this.checkin();
      this.nights();
      this.filters();
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

  private request(page: number) {
    return firstValueFrom(
      this.tourism.hotelPage({
        cityId: this.cityId() || undefined,
        checkin: this.checkin(),
        nights: this.nights(),
        // همان ظرفیتی که صفحهٔ هتل برای اتاق‌ها می‌پرسد، تا هتلی که اینجا
        // هست آنجا خالی درنیاید
        capacity: 2,
        filters: this.filters(),
        page,
        pageSize: HotelListPage.PAGE_SIZE,
      }),
    );
  }

  protected async load(): Promise<void> {
    const id = ++this.loadId;
    this.loading.set(true);
    this.loadingMore.set(false);
    this.error.set(null);
    try {
      // استپر شب و اسلایدر قیمت چند تغییر پشت‌سرهم می‌سازند — یک درخواست کافی است
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (id !== this.loadId) return;
      const [cities, result] = await Promise.all([
        this.cities().length > 0
          ? Promise.resolve(this.cities())
          : firstValueFrom(this.tourism.cities()),
        this.request(1),
      ]);
      if (id !== this.loadId) return;
      this.cities.set(cities);
      this.page = 1;
      this.hotels.set(result.items);
      this.total.set(result.total);
      this.unfilteredTotal.set(result.unfilteredTotal);
      this.facets.set(result.facets);
    } catch {
      if (id === this.loadId) this.error.set('دریافت فهرست هتل‌ها ناموفق بود');
    } finally {
      if (id === this.loadId) this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    if (this.loading() || this.loadingMore() || !this.hasMore()) return;
    const id = this.loadId;
    this.loadingMore.set(true);
    try {
      const result = await this.request(this.page + 1);
      if (id !== this.loadId) return;
      this.page = result.page;
      this.hotels.update((hotels) => [...hotels, ...result.items]);
      this.total.set(result.total);
    } catch {
      // دکمهٔ «نمایش بیشتر» می‌ماند تا دوباره امتحان شود
    } finally {
      if (id === this.loadId) this.loadingMore.set(false);
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
