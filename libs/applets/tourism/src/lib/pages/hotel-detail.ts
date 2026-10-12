import { Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideMapPin,
  lucideNavigation,
  lucideStar,
} from '@ng-icons/lucide';
import { HotelDetail, RoomOffer } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { firstValueFrom, map } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import { addDays, faNumber, jalaliLong, toman, today } from '../format';
import { StayPicker, clampNights, validCheckin } from '../ui/stay-picker';

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
    HlmSheetImports,
    HlmSkeletonImports,
    NgIcon,
    StayPicker,
  ],
  viewProviders: [
    provideIcons({
      lucideCheck,
      lucideMapPin,
      lucideNavigation,
      lucideStar,
    }),
  ],
  templateUrl: './hotel-detail.html',
})
export class HotelDetailPage {
  private readonly tourism = inject(TourismService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly hotel = signal<HotelDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly activeImage = signal(0);

  /**
   * چهار بندانگشتی نشان داده می‌شود و بقیه پشت «+N» جمع می‌شوند. سقف چهارتاست
   * تا ارتفاع بالای صفحه ثابت بماند و اطلاعات هتل زیر خط تا نیفتد؛ «+N» بقیه را
   * در یک مدال باز می‌کند نه پشت‌سرهم در همین نوار.
   */
  private static readonly THUMB_LIMIT = 4;

  protected readonly thumbs = computed(() =>
    (this.hotel()?.images ?? []).slice(0, HotelDetailPage.THUMB_LIMIT),
  );

  /** تعداد تصویرهای جامانده — صفر یعنی «+N» لازم نیست */
  protected readonly hiddenImageCount = computed(() =>
    Math.max(
      0,
      (this.hotel()?.images ?? []).length - HotelDetailPage.THUMB_LIMIT,
    ),
  );

  protected readonly galleryOpen = signal(false);
  protected readonly galleryState = computed(() =>
    this.galleryOpen() ? ('open' as const) : ('closed' as const),
  );

  protected onGalleryStateChange(state: string): void {
    if (state === 'closed') this.galleryOpen.set(false);
  }

  protected readonly nearPlacesOpen = signal(false);
  protected readonly nearPlacesSheetState = computed(() =>
    this.nearPlacesOpen() ? ('open' as const) : ('closed' as const),
  );

  protected readonly nearPlacesPreview = computed(() =>
    (this.hotel()?.nearPlaces ?? []).slice(0, 5),
  );

  protected onNearPlacesStateChange(state: string): void {
    if (state === 'closed') this.nearPlacesOpen.set(false);
  }

  /** انتخاب از داخل مدال: تصویر اصلی عوض شود و مدال بسته شود */
  protected pickImage(index: number): void {
    this.activeImage.set(index);
    this.galleryOpen.set(false);
  }

  private readonly hotelId = this.route.snapshot.paramMap.get('hotelId') ?? '';

  /**
   * تاریخ و تعداد شب از query string خوانده می‌شوند — reactive، نه snapshot:
   * Angular وقتی فقط query param عوض شود کامپوننت را دوباره نمی‌سازد، پس
   * snapshot اتاق‌های تاریخ قبلی را نگه می‌داشت.
   */
  private readonly stay = toSignal(
    this.route.queryParamMap.pipe(
      map((query) => ({
        checkin: validCheckin(query.get('checkin'), addDays(today(), 1)),
        nights: clampNights(Number(query.get('nights') ?? 1)),
      })),
    ),
    { requireSync: true },
  );
  protected readonly checkin = computed(() => this.stay().checkin);
  protected readonly nights = computed(() => this.stay().nights);

  /**
   * اتاق‌ها و قیمت‌ها به تاریخ وابسته‌اند. `rxResource` با هر تغییر تاریخ یا
   * شب دوباره می‌گیرد و درخواست قبلی را لغو می‌کند، تا پاسخ کهنه روی پاسخ
   * تازه ننشیند. جدا از اطلاعات هتل شکست می‌خورد و پیام جدا دارد.
   */
  protected readonly roomsResource = rxResource({
    params: () => ({ checkin: this.checkin(), nights: this.nights() }),
    stream: ({ params }) =>
      this.tourism
        .availability(this.hotelId, params.checkin, params.nights)
        .pipe(map(([availability]) => availability?.rooms ?? [])),
    defaultValue: [] as RoomOffer[],
  });
  protected readonly rooms = computed(() =>
    this.roomsResource.error() ? [] : this.roomsResource.value(),
  );
  protected readonly roomsLoading = this.roomsResource.isLoading;
  protected readonly roomsError = computed(() =>
    this.roomsResource.error() ? 'بررسی اتاق‌های خالی ناموفق بود' : null,
  );

  /** تغییر تاریخ در همین صفحه → query string (بدون entry تازه در history) */
  protected setStay(change: { checkin?: string; nights?: number }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: change,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  /** فقط امکانات موجود، با برچسب فارسی */
  protected readonly facilities = computed(() =>
    Object.entries(this.hotel()?.facilities ?? {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => FACILITY_LABELS[key] ?? key),
  );

  protected readonly reviewAverage = computed(() => {
    const reviews = this.hotel()?.reviews ?? [];
    if (!reviews.length) return 0;
    return (
      reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    );
  });

  constructor() {
    void this.load();
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

  protected loadRooms(): void {
    this.roomsResource.reload();
  }

  protected selectRoom(room: RoomOffer): void {
    void this.router.navigate(['/tourism/book'], {
      queryParams: {
        hotelId: this.hotelId,
        roomId: room.roomId,
        checkin: this.checkin(),
        nights: this.nights(),
      },
    });
  }

  protected back(): void {
    void this.router.navigate(['/tourism'], {
      queryParams: { checkin: this.checkin(), nights: this.nights() },
    });
  }

  protected stars(rate: number): number[] {
    return Array.from({ length: rate }, (_, index) => index);
  }

  protected directionsUrl(hotel: HotelDetail): string | null {
    if (!hotel.geo) return null;
    const destination = encodeURIComponent(`${hotel.geo.lat},${hotel.geo.lng}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
  }

  /** درصد تخفیف نسبت به قیمت بورد هتل — صفر یعنی تخفیفی نیست */
  protected discount(room: RoomOffer): number {
    if (room.rackRate <= room.price) return 0;
    return Math.round(((room.rackRate - room.price) / room.rackRate) * 100);
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly date = jalaliLong;
}
