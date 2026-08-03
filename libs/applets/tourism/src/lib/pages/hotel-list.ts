import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucidePlus } from '@ng-icons/lucide';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { HotelSummary, TourismCity } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { addDays, faNumber, isoToJalali, jalaliLong, jalaliToIso, today } from '../format';

@Component({
  selector: 'tourism-hotel-list',
  imports: [
    FormsModule,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputGroupImports,
    HlmSelectImports,
    HlmSkeletonImports,
  ],
  viewProviders: [provideIcons({ lucideMinus, lucidePlus })],
  templateUrl: './hotel-list.html',
})
export class HotelListPage {
  private readonly tourism = inject(TourismService);
  private readonly router = inject(Router);

  protected readonly cities = signal<TourismCity[]>([]);
  protected readonly hotels = signal<HotelSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** ۰ = همهٔ شهرها */
  protected readonly cityId = signal(0);
  protected readonly checkin = signal(addDays(today(), 1));
  protected readonly nights = signal(1);

  /** hlm-date-picker با JalaliDate کار می‌کند؛ منبع حقیقت همان ISO بالاست */
  protected readonly checkinDate = computed(() => isoToJalali(this.checkin()));
  protected readonly minDate = isoToJalali(today());

  /** هتل‌هایی که تصویرشان لود نشد — به‌جای کادر خالی، آیکون جایگزین می‌گیرند */
  protected readonly brokenImages = signal(new Set<number>());

  protected readonly checkout = computed(() =>
    addDays(this.checkin(), this.nights()),
  );

  protected readonly stayLabel = computed(
    () =>
      `${jalaliLong(this.checkin())} — ${faNumber(this.nights())} شب`,
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [cities, hotels] = await Promise.all([
        this.cities().length > 0
          ? Promise.resolve(this.cities())
          : firstValueFrom(this.tourism.cities()),
        firstValueFrom(this.tourism.hotels(this.cityId() || undefined)),
      ]);
      this.cities.set(cities);
      this.hotels.set(hotels);
    } catch {
      this.error.set('دریافت فهرست هتل‌ها ناموفق بود');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * برچسبی که روی دکمهٔ select می‌نشیند. بدون این، مقدار خام (`0`) نمایش
   * داده می‌شود. تابع پیکانی است تا `this` به کامپوننت بسته بماند.
   */
  protected readonly cityLabel = (id: number): string =>
    id === 0
      ? 'همهٔ شهرها'
      : (this.cities().find((city) => city.id === id)?.name ?? '');

  protected onCityChange(value: number): void {
    this.cityId.set(value ?? 0);
    void this.load();
  }

  protected onCheckinChange(date: JalaliDate | null): void {
    if (date) this.checkin.set(jalaliToIso(date));
  }

  protected stepNights(delta: number): void {
    this.nights.update((n) => Math.min(30, Math.max(1, n + delta)));
  }

  /** تاریخ و تعداد شب در query param می‌روند تا صفحهٔ هتل هم قابل اشتراک باشد */
  protected openHotel(hotel: HotelSummary): void {
    void this.router.navigate(['/tourism/hotels', hotel.id], {
      queryParams: { checkin: this.checkin(), nights: this.nights() },
    });
  }

  protected markBroken(hotelId: number): void {
    this.brokenImages.update((set) => new Set(set).add(hotelId));
  }

  protected stars(rate: number): number[] {
    return Array.from({ length: rate }, (_, index) => index);
  }

  protected readonly count = faNumber;
}
