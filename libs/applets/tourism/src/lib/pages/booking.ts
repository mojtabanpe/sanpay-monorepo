import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  FormField,
  form,
  minLength,
  pattern,
  required,
  submit,
} from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '@sanpay/applets/auth';
import { SanpayDatePickerWidth } from '@sanpay/dates';
import {
  BookingQuote,
  BookingReceipt,
  HotelBookingGuest,
  PreviousTraveler,
} from '@sanpay/models';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { TourismService } from '../data-access/tourism.service';
import {
  faNumber,
  isoToJalali,
  jalali,
  jalaliLong,
  jalaliToIso,
  today,
  toman,
} from '../format';

@Component({
  selector: 'tourism-booking',
  imports: [
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSkeletonImports,
    FormField,
    SanpayDatePickerWidth,
  ],
  templateUrl: './booking.html',
})
export class BookingPage {
  private readonly tourism = inject(TourismService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly quote = signal<BookingQuote | null>(null);
  protected readonly receipt = signal<BookingReceipt | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly travelersLoading = signal(true);
  protected readonly previousTravelers = signal<PreviousTraveler[]>([]);
  protected readonly selectedTraveler = signal<string | null>(null);

  protected readonly travelerModel = signal<HotelBookingGuest>({
    firstName: '',
    lastName: '',
    nationalCode: '',
    mobile: '',
    birthdate: '',
  });
  protected readonly travelerForm = form(this.travelerModel, (traveler) => {
    required(traveler.firstName, { message: 'نام مسافر را وارد کنید' });
    minLength(traveler.firstName, 2, { message: 'نام باید حداقل ۲ حرف باشد' });
    required(traveler.lastName, {
      message: 'نام خانوادگی مسافر را وارد کنید',
    });
    minLength(traveler.lastName, 2, {
      message: 'نام خانوادگی باید حداقل ۲ حرف باشد',
    });
    pattern(traveler.nationalCode, /^\d{10}$/, {
      message: 'کد ملی باید ۱۰ رقم باشد',
    });
    pattern(traveler.mobile, /^09\d{9}$/, {
      message: 'شمارهٔ موبایل معتبر نیست',
    });
    required(traveler.birthdate, { message: 'تاریخ تولد مسافر را وارد کنید' });
  });

  // همان بازهٔ فرم پرواز
  protected readonly minJalaliBirthdate = isoToJalali('1900-01-01');
  protected readonly defaultJalaliBirthdate = isoToJalali('2000-01-01');
  protected readonly maxJalaliBirthdate = isoToJalali(today());
  protected readonly jalaliBirthdate = computed(() => {
    const value = this.travelerModel().birthdate;
    return value ? isoToJalali(value) : undefined;
  });
  protected readonly allocationId = signal('');

  private readonly params = this.route.snapshot.queryParamMap;
  private readonly hotelId = this.params.get('hotelId') ?? '';
  private readonly roomId = this.params.get('roomId') ?? '';
  private readonly checkin = this.params.get('checkin') ?? '';
  private readonly nights = Number(this.params.get('nights') ?? 1);

  protected readonly selectedWallet = computed(() =>
    this.quote()?.wallets.find(
      (wallet) => wallet.allocationId === this.allocationId(),
    ),
  );

  /** ماندهٔ کیف پول انتخاب‌شده کفاف مبلغ رزرو را می‌دهد؟ */
  protected readonly enoughCredit = computed(() => {
    const wallet = this.selectedWallet();
    const amount = this.quote()?.amount ?? 0;
    return !!wallet && wallet.max >= amount;
  });

  constructor() {
    void this.load();
    void this.loadPreviousTravelers();
  }

  protected selectSelf(): void {
    const profile = this.auth.profile();
    if (!profile) return;
    this.fillTraveler(
      {
        firstName: profile.firstName,
        lastName: profile.lastName,
        nationalCode: profile.nationalCode,
        mobile: profile.phone ?? '',
        birthdate: profile.birthDate ?? '',
      },
      'self',
    );
  }

  protected selectPrevious(traveler: PreviousTraveler): void {
    this.fillTraveler(
      { ...traveler, birthdate: traveler.birthdate ?? '' },
      traveler.nationalCode,
    );
  }

  protected travelerEdited(): void {
    this.selectedTraveler.set(null);
  }

  protected updateBirthdate(value: JalaliDate | null): void {
    this.travelerModel.update((traveler) => ({
      ...traveler,
      birthdate: value ? jalaliToIso(value) : '',
    }));
    this.travelerForm.birthdate().markAsTouched();
    this.travelerEdited();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const quote = await firstValueFrom(
        this.tourism.quote(
          this.hotelId,
          this.roomId,
          this.checkin,
          this.nights,
        ),
      );
      this.quote.set(quote);
      // هر کارمند فقط یک کیف پول گردشگری دارد
      this.allocationId.set(quote.wallets[0]?.allocationId ?? '');
    } catch (error) {
      this.error.set(message(error, 'دریافت اطلاعات رزرو ناموفق بود'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPreviousTravelers(): Promise<void> {
    try {
      const travelers = await firstValueFrom(this.tourism.previousTravelers());
      this.previousTravelers.set(travelers);
    } catch {
      // اختلال این فهرست نباید جلوی رزرو یا ورود دستی مشخصات را بگیرد.
      this.previousTravelers.set([]);
    } finally {
      this.travelersLoading.set(false);
    }
  }

  private fillTraveler(traveler: HotelBookingGuest, key: string): void {
    this.travelerModel.set({
      firstName: traveler.firstName,
      lastName: traveler.lastName,
      nationalCode: traveler.nationalCode,
      mobile: traveler.mobile,
      birthdate: traveler.birthdate,
    });
    this.selectedTraveler.set(key);
  }

  protected confirm(): void {
    if (!this.enoughCredit() || this.busy()) return;

    void submit(this.travelerForm, async () => {
      this.busy.set(true);
      this.error.set(null);
      try {
        const traveler = this.travelerModel();
        this.receipt.set(
          await firstValueFrom(
            this.tourism.book({
              hotelId: this.hotelId,
              roomId: this.roomId,
              checkin: this.checkin,
              nights: this.nights,
              allocationId: this.allocationId(),
              guest: {
                firstName: traveler.firstName.trim(),
                lastName: traveler.lastName.trim(),
                nationalCode: traveler.nationalCode.trim(),
                mobile: traveler.mobile.trim(),
                birthdate: traveler.birthdate,
              },
            }),
          ),
        );
      } catch (error) {
        this.error.set(message(error, 'ثبت رزرو ناموفق بود'));
      } finally {
        this.busy.set(false);
      }
    });
  }

  protected back(): void {
    void this.router.navigate(['/tourism/hotels', this.hotelId], {
      queryParams: { checkin: this.checkin, nights: this.nights },
    });
  }

  protected done(): void {
    void this.router.navigate(['/tourism/bookings']);
  }

  protected stayLabel(quote: BookingQuote): string {
    // «—» و نه «•» — نقطه‌وسط کنار رقم فارسی شبیه صفر خوانده می‌شود
    return `${jalaliLong(quote.checkin)} تا ${jalaliLong(quote.checkout)} — ${faNumber(quote.nights)} شب`;
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly jalali = jalali;
}

/** پیام خطای فارسیِ بک‌اند را نشان می‌دهیم، نه متن خام HTTP */
function message(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const detail = error.error?.message;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && typeof detail[0] === 'string')
      return detail[0];
  }
  return fallback;
}
