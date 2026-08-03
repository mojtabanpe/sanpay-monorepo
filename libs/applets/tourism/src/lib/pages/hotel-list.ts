import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HotelSummary, TourismCity } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { addDays, faNumber, jalaliLong, today } from '../format';

@Component({
  selector: 'tourism-hotel-list',
  imports: [
    FormsModule,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
  ],
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

  protected readonly minDate = today();

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

  protected onCityChange(value: string): void {
    this.cityId.set(Number(value));
    void this.load();
  }

  protected onNightsChange(value: string): void {
    this.nights.set(Math.min(30, Math.max(1, Number(value) || 1)));
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
