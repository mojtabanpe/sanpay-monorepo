import { Component, computed, model } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMinus, lucidePlus } from '@ng-icons/lucide';
import { SanpayDatePickerWidth } from '@sanpay/dates';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { faNumber, isoToJalali, jalaliLong, jalaliToIso, today } from '../format';

/** بیشترین تعداد شب قابل انتخاب */
export const MAX_NIGHTS = 30;

/**
 * تاریخ ورود + تعداد شب — مشترک بین فهرست هتل‌ها و صفحهٔ هتل، تا تغییر
 * تاریخ در هر دو یک شکل داشته باشد. منبع حقیقت ISO (`YYYY-MM-DD`) است؛
 * `JalaliDate` فقط برای خود date-picker ساخته می‌شود.
 */
@Component({
  selector: 'tourism-stay-picker',
  imports: [
    SanpayDatePickerWidth,
    NgIcon,
    HlmButtonImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputGroupImports,
  ],
  viewProviders: [provideIcons({ lucideMinus, lucidePlus })],
  template: `
    <div class="flex gap-3">
      <hlm-field class="flex-1">
        <label hlmFieldLabel>تاریخ ورود</label>
        <hlm-date-picker
          sanpayDatePickerWidth
          [date]="checkinDate()"
          [min]="minDate"
          (dateChange)="onCheckinChange($event)"
        >
          <hlm-date-picker-trigger class="w-full">
            انتخاب تاریخ
          </hlm-date-picker-trigger>
        </hlm-date-picker>
      </hlm-field>

      <hlm-field class="w-32">
        <label hlmFieldLabel>تعداد شب</label>
        <!-- استپر به‌جای input[type=number]: روی موبایل هدف لمسی درست‌تری
             دارد و فلش‌های ریز مرورگر در RTL جای اشتباه می‌نشینند. -->
        <hlm-input-group>
          <hlm-input-group-addon align="inline-start">
            <button
              hlmInputGroupButton
              type="button"
              aria-label="یک شب کمتر"
              size="icon-sm"
              [disabled]="nights() <= 1"
              (click)="stepNights(-1)"
            >
              <ng-icon name="lucideMinus" />
            </button>
          </hlm-input-group-addon>

          <span
            class="flex-1 text-center text-sm font-medium tabular-nums"
            aria-live="polite"
          >
            {{ count(nights()) }}
          </span>

          <hlm-input-group-addon align="inline-end">
            <button
              hlmInputGroupButton
              type="button"
              aria-label="یک شب بیشتر"
              size="icon-sm"
              [disabled]="nights() >= maxNights"
              (click)="stepNights(1)"
            >
              <ng-icon name="lucidePlus" />
            </button>
          </hlm-input-group-addon>
        </hlm-input-group>
      </hlm-field>
    </div>

    <p hlmFieldDescription class="mt-2">{{ stayLabel() }}</p>
  `,
})
export class StayPicker {
  /** ISO `YYYY-MM-DD` */
  readonly checkin = model.required<string>();
  readonly nights = model.required<number>();

  protected readonly maxNights = MAX_NIGHTS;
  protected readonly minDate = isoToJalali(today());
  protected readonly checkinDate = computed(() => isoToJalali(this.checkin()));
  protected readonly stayLabel = computed(
    // «—» نه «•»: نقطه‌وسط کنار رقم فارسی شبیه صفر دیده می‌شود
    () => `${jalaliLong(this.checkin())} — ${faNumber(this.nights())} شب`,
  );
  protected readonly count = faNumber;

  protected onCheckinChange(date: JalaliDate | null): void {
    if (date) this.checkin.set(jalaliToIso(date));
  }

  protected stepNights(delta: number): void {
    this.nights.update((n) => clampNights(n + delta));
  }
}

export function clampNights(value: number): number {
  return Number.isFinite(value)
    ? Math.min(MAX_NIGHTS, Math.max(1, Math.round(value)))
    : 1;
}

/** تاریخ ISO معتبر و نه گذشته؛ وگرنه `fallback` */
export function validCheckin(value: string | null, fallback: string): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today()
    ? value
    : fallback;
}
