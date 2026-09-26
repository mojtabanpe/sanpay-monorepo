import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeftRight,
  lucidePlane,
  lucideHotel,
  lucideSearch,
  lucideUsers,
  lucideChevronDown,
  lucidePlus,
  lucideMinus,
  lucideLuggage,
  lucideMoveLeft,
} from '@ng-icons/lucide';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@sanpay/applets/auth';
import {
  SanpayDatePickerWidth,
  SanpayGregorianDatePicker,
} from '@sanpay/dates';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import {
  FlightAirport,
  FlightBookingReceipt,
  FlightOffer,
  FlightPassenger,
  FlightQuote,
  FlightSearchInput,
  PreviousTraveler,
} from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmNativeSelectImports } from '@sanpay/ui/native-select';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { firstValueFrom } from 'rxjs';
import { FlightsService } from '../data-access/flights.service';
import { TourismService } from '../data-access/tourism.service';
import {
  addDays,
  faNumber,
  isoToJalali,
  jalaliLong,
  jalaliToIso,
  today,
  toman,
} from '../format';

@Component({
  selector: 'tourism-flights',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgIcon,
    RouterLink,
    SanpayDatePickerWidth,
    SanpayGregorianDatePicker,
    HlmButtonImports,
    HlmCardImports,
    HlmInputImports,
    HlmFieldImports,
    HlmNativeSelectImports,
    HlmToggleGroupImports,
    HlmDatePickerImports,
    HlmBadgeImports,
  ],
  providers: [
    provideIcons({
      lucideArrowLeftRight,
      lucideHotel,
      lucidePlane,
      lucideSearch,
      lucideUsers,
      lucideChevronDown,
      lucidePlus,
      lucideMinus,
      lucideLuggage,
      lucideMoveLeft,
    }),
  ],
  templateUrl: './flights.html',
})
export class FlightsPage {
  private readonly api = inject(FlightsService);
  private readonly tourism = inject(TourismService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly airports = signal<FlightAirport[]>([]);
  protected readonly offers = signal<FlightOffer[]>([]);
  protected readonly quote = signal<FlightQuote | null>(null);
  protected readonly bookings = signal<FlightBookingReceipt[]>([]);
  protected readonly busy = signal(false);
  protected readonly loadingAirports = signal(true);
  protected readonly error = signal('');
  protected readonly historyError = signal('');
  protected readonly searched = signal(false);
  protected readonly receipt = signal<FlightBookingReceipt | null>(null);
  protected readonly passengers = signal<FlightPassenger[]>([]);
  protected readonly travelersLoading = signal(true);
  protected readonly previousTravelers = signal<PreviousTraveler[]>([]);
  protected readonly selectedTravelers = signal<Record<number, string | null>>(
    {},
  );
  protected readonly search = signal<FlightSearchInput>({
    origin: '',
    destination: '',
    departureDate: addDays(today(), 1),
    adults: 1,
    children: 0,
    infants: 0,
  });
  protected readonly passengerTypes = [
    { key: 'adults', label: 'بزرگسال', hint: '۱۲ سال به بالا' },
    { key: 'children', label: 'کودک', hint: '۲ تا ۱۲ سال' },
    { key: 'infants', label: 'نوزاد', hint: 'کمتر از ۲ سال' },
  ] as const;
  protected readonly passengerCount = computed(
    () => this.search().adults + this.search().children + this.search().infants,
  );
  protected changeCount(
    key: 'adults' | 'children' | 'infants',
    delta: number,
  ): void {
    if (!this.canChangeCount(key, delta)) return;
    this.updateSearch(key, this.search()[key] + delta);
  }
  protected canChangeCount(
    key: 'adults' | 'children' | 'infants',
    delta: number,
  ): boolean {
    const s = this.search();
    const next = { ...s, [key]: s[key] + delta };
    return (
      next.adults >= 1 &&
      next.children >= 0 &&
      next.infants >= 0 &&
      next.adults + next.children <= 9 &&
      next.infants <= next.adults
    );
  }
  protected airportLabel(iata: string): string {
    const names: Record<string, string> = {
      THR: 'تهران · مهرآباد',
      IKA: 'تهران · امام خمینی',
      MHD: 'مشهد',
      SYZ: 'شیراز',
      IFN: 'اصفهان',
      KIH: 'کیش',
      TBZ: 'تبریز',
      KER: 'کرمان',
    };
    return (
      names[iata] ??
      this.airportName(iata).replace(/^فرودگاه\s+(بین[‌ ]المللی\s+)?/, '')
    );
  }
  protected roundTrip = false;
  protected allocationId = '';
  protected readonly minDate = isoToJalali(today());
  protected readonly minJalaliBirthdate = isoToJalali('1900-01-01');
  protected readonly defaultJalaliBirthdate = isoToJalali('2000-01-01');
  protected readonly maxJalaliBirthdate = isoToJalali(today());
  protected readonly minPassportExpiry = new Date();
  protected readonly departureDate = computed(() =>
    isoToJalali(this.search().departureDate),
  );
  protected readonly returnDate = computed(() =>
    isoToJalali(
      this.search().returnDate || addDays(this.search().departureDate, 1),
    ),
  );
  protected readonly canPay = computed(() => {
    const q = this.quote();
    return q?.wallets.some((w) => w.max >= q.offer.amount) ?? false;
  });
  protected readonly hasBookingContact = computed(() => {
    const profile = this.auth.profile();
    return !!(
      profile?.firstName.trim() &&
      profile.lastName.trim() &&
      profile.phone?.match(/^09\d{9}$/)
    );
  });
  protected readonly money = toman;
  protected readonly number = faNumber;
  protected readonly dateLabel = jalaliLong;
  private searchedInput: FlightSearchInput | null = null;
  private historyLoading = false;
  constructor() {
    void this.loadAirports();
    void this.loadBookings();
    void this.loadPreviousTravelers();
    const timer = setInterval(() => {
      if (
        this.bookings().some(
          (b) => b.status === 'PROCESSING' || b.status === 'REVIEW',
        )
      )
        void this.loadBookings();
    }, 10000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
  protected async loadAirports(): Promise<void> {
    this.loadingAirports.set(true);
    this.error.set('');
    try {
      this.airports.set(await firstValueFrom(this.api.airports()));
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.loadingAirports.set(false);
    }
  }
  protected updateSearch<K extends keyof FlightSearchInput>(
    key: K,
    value: FlightSearchInput[K],
  ): void {
    this.search.update((s) => ({ ...s, [key]: value }));
    this.offers.set([]);
    this.searched.set(false);
    this.quote.set(null);
  }
  protected setDate(date: JalaliDate | null, returning = false): void {
    if (date)
      this.updateSearch(
        returning ? 'returnDate' : 'departureDate',
        jalaliToIso(date),
      );
  }
  protected changeTrip(): void {
    this.updateSearch(
      'returnDate',
      this.roundTrip ? addDays(this.search().departureDate, 1) : undefined,
    );
  }
  protected swap(): void {
    const s = this.search();
    this.updateSearch('origin', s.destination);
    this.updateSearch('destination', s.origin);
  }
  protected async findFlights(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.quote.set(null);
    this.receipt.set(null);
    this.offers.set([]);
    this.searched.set(false);
    const input = { ...this.search() };
    try {
      this.offers.set(
        (await firstValueFrom(this.api.search(input))).sort(
          (a, b) => a.amount - b.amount,
        ),
      );
      this.searchedInput = input;
      this.searched.set(true);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  protected async select(offer: FlightOffer): Promise<void> {
    if (this.busy() || !this.searchedInput) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const q = await firstValueFrom(
        this.api.quote(this.searchedInput, offer.id),
      );
      this.quote.set(q);
      this.allocationId =
        q.wallets.find((w) => w.max >= q.offer.amount)?.allocationId ?? '';
      this.passengers.set(
        (['adult', 'child', 'infant'] as const).flatMap((type) =>
          Array.from(
            {
              length:
                type === 'adult'
                  ? q.search.adults
                  : type === 'child'
                    ? q.search.children
                    : q.search.infants,
            },
            () => ({
              type,
              firstName: '',
              lastName: '',
              gender: 'male' as const,
              birthdate: '',
              nationality: 'IR',
            }),
          ),
        ),
      );
      this.selectedTravelers.set({});
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  protected updatePassenger(
    index: number,
    key: keyof FlightPassenger,
    value: string,
  ): void {
    this.passengers.update((items) =>
      items.map((p, i) => (i === index ? { ...p, [key]: value } : p)),
    );
    this.selectedTravelers.update((selected) => ({
      ...selected,
      [index]: null,
    }));
  }
  protected dateValue(value: string | undefined): Date | undefined {
    if (!value) return undefined;
    const [year, month, day] = value.split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : undefined;
  }
  protected updateGregorianDate(
    index: number,
    key: 'birthdate' | 'passportExpirationDate',
    value: Date | null,
  ): void {
    this.updatePassenger(index, key, value ? isoDate(value) : '');
  }
  protected jalaliDateValue(value: string | undefined): JalaliDate | undefined {
    return value ? isoToJalali(value) : undefined;
  }
  protected updateJalaliBirthdate(
    index: number,
    value: JalaliDate | null,
  ): void {
    this.updatePassenger(index, 'birthdate', value ? jalaliToIso(value) : '');
  }
  protected selectPrevious(index: number, traveler: PreviousTraveler): void {
    this.fillPassenger(index, traveler, traveler.nationalCode);
  }
  private fillPassenger(
    index: number,
    traveler: PreviousTraveler,
    key: string,
  ): void {
    this.passengers.update((items) =>
      items.map((passenger, i) =>
        i === index
          ? {
              ...passenger,
              firstName: traveler.firstName,
              lastName: traveler.lastName,
              nationalCode: traveler.nationalCode,
              ...(traveler.birthdate ? { birthdate: traveler.birthdate } : {}),
              ...(traveler.gender ? { gender: traveler.gender } : {}),
              ...(traveler.nationality
                ? { nationality: traveler.nationality }
                : {}),
              ...(traveler.passportNumber
                ? { passportNumber: traveler.passportNumber }
                : {}),
              ...(traveler.passportExpirationDate
                ? {
                    passportExpirationDate: traveler.passportExpirationDate,
                  }
                : {}),
              ...(traveler.passportIssueCountry
                ? { passportIssueCountry: traveler.passportIssueCountry }
                : {}),
            }
          : passenger,
      ),
    );
    this.selectedTravelers.update((selected) => ({
      ...selected,
      [index]: key,
    }));
  }
  private async loadPreviousTravelers(): Promise<void> {
    try {
      const travelers = await firstValueFrom(this.tourism.previousTravelers());
      this.previousTravelers.set(travelers);
    } catch {
      this.previousTravelers.set([]);
    } finally {
      this.travelersLoading.set(false);
    }
  }
  protected needsPassport(p: FlightPassenger): boolean {
    return !!(
      this.quote()?.offer.departure.foreign ||
      this.quote()?.offer.returning?.foreign ||
      p.nationality !== 'IR'
    );
  }
  protected async pay(): Promise<void> {
    const q = this.quote();
    const profile = this.auth.profile();
    if (!q || !profile || !this.hasBookingContact() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const receipt = await firstValueFrom(
        this.api.book({
          quoteId: q.id,
          allocationId: this.allocationId,
          bookerFirstName: profile.firstName.trim(),
          bookerLastName: profile.lastName.trim(),
          mobile: profile.phone ?? '',
          passengers: this.passengers().map(
            (p) =>
              Object.fromEntries(
                Object.entries(p).filter(([, v]) => v !== ''),
              ) as unknown as FlightPassenger,
          ),
        }),
      );
      this.receipt.set(receipt);
      this.quote.set(null);
      await this.loadBookings();
    } catch (error) {
      this.error.set(this.message(error));
      await this.loadBookings();
    } finally {
      this.busy.set(false);
    }
  }
  protected async loadBookings(): Promise<void> {
    if (this.historyLoading) return;
    this.historyLoading = true;
    try {
      const bookings = await firstValueFrom(this.api.bookings());
      this.bookings.set(bookings);
      this.historyError.set('');
      const current = this.receipt();
      if (current)
        this.receipt.set(bookings.find((b) => b.id === current.id) ?? current);
    } catch {
      this.historyError.set('دریافت رزروهای پرواز ناموفق بود');
    } finally {
      this.historyLoading = false;
    }
  }
  protected airportName(iata: string): string {
    return this.airports().find((a) => a.iata === iata)?.name ?? iata;
  }
  protected statusLabel(status: string): string {
    return (
      (
        {
          CONFIRMED: 'رزرو قطعی',
          PROCESSING: 'در حال صدور',
          REVIEW: 'در انتظار بررسی',
          REJECTED: 'رزرو ناموفق',
        } as Record<string, string>
      )[status] ?? 'در انتظار بررسی'
    );
  }
  protected ageLabel(type: string): string {
    return type === 'adult' ? 'بزرگسال' : type === 'child' ? 'کودک' : 'نوزاد';
  }
  private message(error: unknown): string {
    const message =
      error instanceof HttpErrorResponse ? error.error?.message : null;
    return typeof message === 'string'
      ? message
      : 'درخواست انجام نشد؛ اطلاعات را بررسی و دوباره تلاش کنید';
  }
}

function isoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
