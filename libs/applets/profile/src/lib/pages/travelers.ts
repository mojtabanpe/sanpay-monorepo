import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CountryPicker, TourismService } from '@sanpay/applets/tourism';
import {
  SanpayDatePickerWidth,
  SanpayGregorianDatePicker,
  isoToJalali,
  jalaliToIso,
} from '@sanpay/dates';
import { toLatinDigits } from '@sanpay/forms';
import {
  PreviousTraveler,
  SaveTravelerInput,
  countryLabel,
} from '@sanpay/models';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSheetImports } from '@sanpay/ui/sheet';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { firstValueFrom } from 'rxjs';
import { jalali } from '../format';

const PERSIAN_NAME =
  /^(?:(?![\u0660-\u0669\u06F0-\u06F9])[\u0600-\u06FF\u200c ])+$/;
const LATIN_NAME = /^[A-Za-z][A-Za-z '-]{0,69}$/;

interface TravelerDraft {
  nationalCode: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  mobile: string;
  birthdate: string;
  gender: 'male' | 'female' | '';
  nationality: string;
  passportNumber: string;
  passportExpirationDate: string;
  passportIssueCountry: string;
}

function emptyDraft(): TravelerDraft {
  return {
    nationalCode: '',
    firstName: '',
    lastName: '',
    firstNameEn: '',
    lastNameEn: '',
    mobile: '',
    birthdate: '',
    gender: 'male',
    nationality: 'IR',
    passportNumber: '',
    passportExpirationDate: '',
    passportIssueCountry: 'IR',
  };
}

@Component({
  selector: 'profile-travelers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    CountryPicker,
    SanpayDatePickerWidth,
    SanpayGregorianDatePicker,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSheetImports,
    HlmSkeletonImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './travelers.html',
})
export class TravelersPage {
  private readonly tourism = inject(TourismService);

  protected readonly travelers = signal<PreviousTraveler[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** null = فرم بسته، 'new' = افزودن، یا شیء مسافر برای ویرایش */
  protected readonly editorMode = signal<'new' | PreviousTraveler | null>(null);
  protected readonly draft = signal<TravelerDraft>(emptyDraft());
  protected readonly formError = signal<string | null>(null);

  /** مسافر انتخاب‌شده برای تأیید حذف در باتم‌شیت */
  protected readonly deleting = signal<PreviousTraveler | null>(null);

  protected readonly minJalaliBirthdate = isoToJalali('1900-01-01');
  protected readonly defaultJalaliBirthdate = isoToJalali('2000-01-01');
  protected readonly maxJalaliBirthdate = isoToJalali(toIsoDate(new Date()));
  protected readonly minPassportExpiry = new Date();

  protected readonly editingTitle = computed(() =>
    this.editorMode() === 'new' ? 'افزودن مسافر جدید' : 'ویرایش مشخصات مسافر',
  );

  private readonly jalaliCache = new Map<string, JalaliDate>();
  private readonly gregorianCache = new Map<string, Date | undefined>();

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await firstValueFrom(this.tourism.previousTravelers());
      this.travelers.set(list);
    } catch (caught) {
      this.error.set(serverError(caught, 'دریافت فهرست مسافران ناموفق بود'));
    } finally {
      this.loading.set(false);
    }
  }

  protected startCreate(): void {
    this.draft.set(emptyDraft());
    this.formError.set(null);
    this.notice.set(null);
    this.editorMode.set('new');
  }

  protected startEdit(traveler: PreviousTraveler): void {
    this.draft.set({
      nationalCode: traveler.nationalCode,
      firstName: traveler.firstName,
      lastName: traveler.lastName,
      firstNameEn: traveler.firstNameEn ?? '',
      lastNameEn: traveler.lastNameEn ?? '',
      mobile: traveler.mobile,
      birthdate: traveler.birthdate ?? '',
      gender: traveler.gender ?? '',
      nationality: traveler.nationality ?? 'IR',
      passportNumber: traveler.passportNumber ?? '',
      passportExpirationDate: traveler.passportExpirationDate ?? '',
      passportIssueCountry: traveler.passportIssueCountry ?? 'IR',
    });
    this.formError.set(null);
    this.notice.set(null);
    this.editorMode.set(traveler);
  }

  protected cancelEdit(): void {
    this.editorMode.set(null);
    this.formError.set(null);
  }

  protected updateDraft<K extends keyof TravelerDraft>(
    key: K,
    value: TravelerDraft[K],
  ): void {
    const normalized =
      typeof value === 'string' &&
      (key === 'nationalCode' || key === 'mobile' || key === 'passportNumber')
        ? (toLatinDigits(value) as TravelerDraft[K])
        : value;
    this.draft.update((current) => ({ ...current, [key]: normalized }));
    this.formError.set(null);
  }

  protected jalaliBirthdateValue(value: string): JalaliDate | undefined {
    if (!value) return undefined;
    let cached = this.jalaliCache.get(value);
    if (!cached) {
      cached = isoToJalali(value);
      this.jalaliCache.set(value, cached);
    }
    return cached;
  }

  protected setJalaliBirthdate(value: JalaliDate | null): void {
    this.updateDraft('birthdate', value ? jalaliToIso(value) : '');
  }

  protected gregorianDateValue(value: string): Date | undefined {
    if (!value) return undefined;
    if (!this.gregorianCache.has(value)) {
      const [year, month, day] = value.split('-').map(Number);
      this.gregorianCache.set(
        value,
        year && month && day ? new Date(year, month - 1, day) : undefined,
      );
    }
    return this.gregorianCache.get(value);
  }

  protected setPassportExpiry(value: Date | null): void {
    this.updateDraft('passportExpirationDate', value ? toIsoDate(value) : '');
  }

  protected async save(): Promise<void> {
    const mode = this.editorMode();
    if (!mode || this.busy()) return;

    const current = this.draft();
    const validationError = validateDraft(current);
    if (validationError) {
      this.formError.set(validationError);
      return;
    }

    const payload = buildPayload(current);
    this.busy.set(true);
    this.formError.set(null);
    this.notice.set(null);
    try {
      if (mode === 'new') {
        const created = await firstValueFrom(
          this.tourism.createTraveler(payload),
        );
        this.travelers.update((list) => [created, ...list]);
        this.notice.set('مسافر جدید به فهرست اضافه شد.');
      } else {
        const updated = await firstValueFrom(
          this.tourism.updateTraveler(mode.id, payload),
        );
        this.travelers.update((list) =>
          list.map((item) => (item.id === updated.id ? updated : item)),
        );
        this.notice.set('مشخصات مسافر ذخیره شد.');
      }
      this.editorMode.set(null);
    } catch (caught) {
      this.formError.set(
        serverError(caught, 'ذخیرهٔ مشخصات مسافر ناموفق بود؛ دوباره تلاش کنید'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected askDelete(traveler: PreviousTraveler): void {
    this.error.set(null);
    this.deleting.set(traveler);
  }

  protected onDeleteSheetState(state: string): void {
    if (state === 'closed' && !this.busy()) {
      this.deleting.set(null);
    }
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleting();
    if (!target || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.tourism.deleteTraveler(target.id));
      this.travelers.update((list) =>
        list.filter((item) => item.id !== target.id),
      );
      const currentMode = this.editorMode();
      if (
        currentMode &&
        currentMode !== 'new' &&
        currentMode.id === target.id
      ) {
        this.editorMode.set(null);
      }
      this.deleting.set(null);
      this.notice.set('مسافر از فهرست حذف شد.');
    } catch (caught) {
      this.error.set(serverError(caught, 'حذف مسافر ناموفق بود'));
    } finally {
      this.busy.set(false);
    }
  }

  protected primaryName(traveler: PreviousTraveler): string {
    const fa = [traveler.firstName, traveler.lastName].filter(Boolean).join(' ');
    if (fa) return fa;
    const en = [traveler.firstNameEn, traveler.lastNameEn]
      .filter(Boolean)
      .join(' ');
    return en || traveler.nationalCode;
  }

  protected secondaryName(traveler: PreviousTraveler): string {
    const fa = [traveler.firstName, traveler.lastName].filter(Boolean).join(' ');
    const en = [traveler.firstNameEn, traveler.lastNameEn]
      .filter(Boolean)
      .join(' ');
    return fa && en ? en : '';
  }

  protected readonly countryLabel = countryLabel;
  protected readonly jalali = jalali;
}

function validateDraft(d: TravelerDraft): string | null {
  const nationalCode = toLatinDigits(d.nationalCode.trim());
  if (!/^\d{10}$/.test(nationalCode)) {
    return 'کد ملی باید ۱۰ رقم باشد.';
  }
  const firstFa = d.firstName.trim();
  const lastFa = d.lastName.trim();
  const firstEn = d.firstNameEn.trim();
  const lastEn = d.lastNameEn.trim();

  if ((firstFa && !lastFa) || (!firstFa && lastFa)) {
    return 'نام و نام خانوادگی فارسی را با هم وارد کنید.';
  }
  if ((firstEn && !lastEn) || (!firstEn && lastEn)) {
    return 'نام و نام خانوادگی انگلیسی را با هم وارد کنید.';
  }
  if (!firstFa && !firstEn) {
    return 'حداقل نام و نام خانوادگی فارسی یا انگلیسی مسافر را وارد کنید.';
  }
  if (firstFa && !PERSIAN_NAME.test(firstFa)) {
    return 'نام فارسی را فقط با حروف فارسی بنویسید.';
  }
  if (lastFa && !PERSIAN_NAME.test(lastFa)) {
    return 'نام خانوادگی فارسی را فقط با حروف فارسی بنویسید.';
  }
  if (firstEn && !LATIN_NAME.test(firstEn)) {
    return 'نام انگلیسی را فقط با حروف انگلیسی بنویسید.';
  }
  if (lastEn && !LATIN_NAME.test(lastEn)) {
    return 'نام خانوادگی انگلیسی را فقط با حروف انگلیسی بنویسید.';
  }
  const mobile = toLatinDigits(d.mobile.trim());
  if (mobile && !/^09\d{9}$/.test(mobile)) {
    return 'شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ شروع شود.';
  }
  const passport = d.passportNumber.trim();
  if (passport && !/^[A-Za-z0-9]{3,20}$/.test(passport)) {
    return 'شماره گذرنامه معتبر نیست.';
  }
  return null;
}

function buildPayload(d: TravelerDraft): SaveTravelerInput {
  const payload: SaveTravelerInput = {
    nationalCode: toLatinDigits(d.nationalCode.trim()),
  };
  const firstName = d.firstName.trim();
  const lastName = d.lastName.trim();
  const firstNameEn = d.firstNameEn.trim();
  const lastNameEn = d.lastNameEn.trim();
  const mobile = toLatinDigits(d.mobile.trim());
  const nationality = d.nationality.trim().toUpperCase();
  const passportNumber = d.passportNumber.trim().toUpperCase();
  const passportIssueCountry = d.passportIssueCountry.trim().toUpperCase();

  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (firstNameEn) payload.firstNameEn = firstNameEn;
  if (lastNameEn) payload.lastNameEn = lastNameEn;
  if (mobile) payload.mobile = mobile;
  if (d.birthdate) payload.birthdate = d.birthdate;
  if (d.gender === 'male' || d.gender === 'female') payload.gender = d.gender;
  if (nationality) payload.nationality = nationality;
  if (passportNumber) payload.passportNumber = passportNumber;
  if (d.passportExpirationDate) {
    payload.passportExpirationDate = d.passportExpirationDate;
  }
  if (passportNumber && passportIssueCountry) {
    payload.passportIssueCountry = passportIssueCountry;
  }
  return payload;
}

function toIsoDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function serverError(caught: unknown, fallback: string): string {
  if (caught instanceof HttpErrorResponse) {
    const detail = caught.error?.message;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && typeof detail[0] === 'string') {
      return detail[0];
    }
  }
  return fallback;
}
