import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HotelDetail, RoomOffer } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { addDays, faNumber, jalaliLong, toman } from '../format';

/** برچسب فارسی امکاناتی که ارزش نمایش دارند — بقیه نادیده گرفته می‌شوند */
const FACILITY_LABELS: Record<string, string> = {
  restaurant: 'رستوران',
  internet: 'اینترنت',
  parking: 'پارکینگ',
  pool: 'استخر',
  sport: 'سالن ورزشی',
  sona: 'سونا',
  cafe: 'کافی‌شاپ',
  labi: 'لابی',
  shop: 'فروشگاه',
  prayRoom: 'نمازخانه',
  tv: 'تلویزیون',
  telInRoom: 'تلفن در اتاق',
  refrigerator: 'یخچال',
  suit: 'سوئیت',
  transport: 'ترانسفر فرودگاهی',
  bilyard: 'بیلیارد',
  satellite: 'ماهواره',
};

@Component({
  selector: 'tourism-hotel-detail',
  imports: [
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmSkeletonImports,
  ],
  templateUrl: './hotel-detail.html',
})
export class HotelDetailPage {
  private readonly tourism = inject(TourismService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly hotel = signal<HotelDetail | null>(null);
  protected readonly rooms = signal<RoomOffer[]>([]);
  protected readonly loading = signal(true);
  protected readonly roomsLoading = signal(true);
  protected readonly error = signal<string | null>(null);
  /** جست‌وجوی اتاق جدا از اطلاعات هتل شکست می‌خورد — پیام جدا هم دارد */
  protected readonly roomsError = signal<string | null>(null);

  protected readonly activeImage = signal(0);

  private readonly hotelId = Number(this.route.snapshot.paramMap.get('hotelId'));
  protected readonly checkin =
    this.route.snapshot.queryParamMap.get('checkin') ?? addDays(new Date().toISOString().slice(0, 10), 1);
  protected readonly nights = Number(
    this.route.snapshot.queryParamMap.get('nights') ?? 1,
  );

  protected readonly stayLabel = computed(
    // جداکننده «—» است نه «•»: نقطه‌وسط کنار رقم فارسی شبیه صفر دیده می‌شود
    // و «• ۲ شب» را «۲۰ شب» می‌خواند.
    () => `${jalaliLong(this.checkin)} — ${faNumber(this.nights)} شب`,
  );

  /** فقط امکانات موجود، با برچسب فارسی */
  protected readonly facilities = computed(() =>
    Object.entries(this.hotel()?.facilities ?? {})
      .filter(([key, enabled]) => enabled && FACILITY_LABELS[key])
      .map(([key]) => FACILITY_LABELS[key]),
  );

  constructor() {
    void this.load();
    void this.loadRooms();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.hotel.set(await firstValueFrom(this.tourism.hotel(this.hotelId)));
    } catch {
      this.error.set('اطلاعات این هتل دریافت نشد');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadRooms(): Promise<void> {
    this.roomsLoading.set(true);
    this.roomsError.set(null);
    try {
      const [availability] = await firstValueFrom(
        this.tourism.availability(this.hotelId, this.checkin, this.nights),
      );
      this.rooms.set(availability?.rooms ?? []);
    } catch {
      this.roomsError.set('بررسی اتاق‌های خالی ناموفق بود');
    } finally {
      this.roomsLoading.set(false);
    }
  }

  protected selectRoom(room: RoomOffer): void {
    void this.router.navigate(['/tourism/book'], {
      queryParams: {
        hotelId: this.hotelId,
        roomId: room.roomId,
        checkin: this.checkin,
        nights: this.nights,
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/tourism']);
  }

  protected stars(rate: number): number[] {
    return Array.from({ length: rate }, (_, index) => index);
  }

  /** درصد تخفیف نسبت به قیمت بورد هتل — صفر یعنی تخفیفی نیست */
  protected discount(room: RoomOffer): number {
    if (room.rackRate <= room.price) return 0;
    return Math.round(((room.rackRate - room.price) / room.rackRate) * 100);
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
}
