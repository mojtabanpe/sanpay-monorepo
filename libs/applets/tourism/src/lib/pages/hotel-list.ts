import { Component, computed, effect, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideHotel, lucidePlane } from '@ng-icons/lucide';
import { HotelSummary, TourismCity } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmComboboxImports } from '@sanpay/ui/combobox';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { addDays, faNumber, today } from '../format';
import { StayPicker, clampNights, validCheckin } from '../ui/stay-picker';

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
    HlmComboboxImports,
    HlmSkeletonImports,
  ],
  viewProviders: [
    provideIcons({ lucideHotel, lucidePlane }),
  ],
  templateUrl: './hotel-list.html',
})
export class HotelListPage {
  private readonly tourism = inject(TourismService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly query = this.route.snapshot.queryParamMap;

  protected readonly cities = signal<TourismCity[]>([]);
  protected readonly hotels = signal<HotelSummary[]>([]);
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
    const hotels = this.hotels();
    const chunks: HotelSummary[][] = [];
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

  /** هتل‌هایی که تصویرشان لود نشد — به‌جای کادر خالی، آیکون جایگزین می‌گیرند */
  protected readonly brokenImages = signal(new Set<string>());

  constructor() {
    void this.load();
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
    this.loading.set(true);
    this.error.set(null);
    try {
      const [cities, hotels] = await Promise.all([
        this.cities().length > 0
          ? Promise.resolve(this.cities())
          : firstValueFrom(this.tourism.cities()),
        firstValueFrom(this.tourism.hotels(this.cityId() || undefined)),
      ]);
      if (id !== this.loadId) return;
      this.cities.set(cities);
      this.hotels.set(hotels);
    } catch {
      if (id === this.loadId) this.error.set('دریافت فهرست هتل‌ها ناموفق بود');
    } finally {
      if (id === this.loadId) this.loading.set(false);
    }
  }

  /**
   * برچسبی که روی دکمهٔ select می‌نشیند. بدون این، مقدار خام (`0`) نمایش
   * داده می‌شود. تابع پیکانی است تا `this` به کامپوننت بسته بماند.
   */
  protected readonly cityLabel = (id: string): string =>
    !id
      ? 'همهٔ شهرها'
      : (this.cities().find((city) => city.id === id)?.name ?? '');

  protected readonly filterCity = (id: string, search: string): boolean =>
    normalizeCityName(this.cityLabel(id)).includes(normalizeCityName(search));

  protected onCityChange(value: string | null | undefined): void {
    this.cityId.set(value ?? '');
    void this.load();
  }

  /** تاریخ و تعداد شب در query param می‌روند تا صفحهٔ هتل هم قابل اشتراک باشد */
  protected openHotel(hotel: HotelSummary): void {
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
}

/** Match Persian and Arabic keyboard variants, spacing and optional diacritics. */
function normalizeCityName(value: string): string {
  return value
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/آ/g, 'ا')
    .replace(/[\u064B-\u065F\u0670\u0640\u200c\s]/g, '')
    .toLocaleLowerCase('fa');
}
