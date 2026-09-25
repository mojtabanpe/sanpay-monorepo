import { Component, input, output } from '@angular/core';
import { provideBrnCalendarI18n } from '@spartan-ng/brain/calendar';
import {
  BrnNativeDateAdapter,
  provideDateAdapter,
} from '@spartan-ng/brain/date-time';
import {
  HlmDatePickerImports,
  provideHlmDatePickerConfig,
} from '@sanpay/ui/date-picker';
import { SanpayDatePickerWidth } from './date-picker-width';

const MONTHS = [
  'ژانویه',
  'فوریه',
  'مارس',
  'آوریل',
  'مه',
  'ژوئن',
  'ژوئیه',
  'اوت',
  'سپتامبر',
  'اکتبر',
  'نوامبر',
  'دسامبر',
] as const;
const WEEKDAYS = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'] as const;
const YEARS = new Intl.NumberFormat('fa-IR', { useGrouping: false });

function formatDate(date: Date): string {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'sanpay-gregorian-date-picker',
  imports: [HlmDatePickerImports, SanpayDatePickerWidth],
  providers: [
    provideDateAdapter(BrnNativeDateAdapter),
    provideBrnCalendarI18n({
      firstDayOfWeek: () => 6,
      months: () => [...MONTHS],
      formatMonth: (month) => MONTHS[month],
      formatYear: (year) => YEARS.format(year),
      formatHeader: (month, year) => `${MONTHS[month]} ${YEARS.format(year)}`,
      formatWeekdayName: (index) => WEEKDAYS[index],
      labelWeekday: (index) => WEEKDAYS[index],
      labelPrevious: () => 'ماه قبل',
      labelNext: () => 'ماه بعد',
      years: (startYear, endYear) => {
        const year = new Date().getFullYear();
        const from = startYear ?? year - 120;
        const to = endYear ?? year + 10;
        return Array.from({ length: to - from + 1 }, (_, i) => from + i);
      },
    }),
    provideHlmDatePickerConfig<Date>({
      autoCloseOnSelect: true,
      formatDate,
      formatInputDate: formatDate,
    }),
  ],
  template: `
    <hlm-date-picker
      sanpayDatePickerWidth
      [date]="date()"
      [defaultFocusedDate]="defaultFocusedDate()"
      [min]="min()"
      [max]="max()"
      [captionLayout]="captionLayout()"
      (dateChange)="dateChange.emit($event)"
    >
      <hlm-date-picker-trigger [buttonId]="buttonId()" [class]="triggerClass()">
        <ng-content />
      </hlm-date-picker-trigger>
    </hlm-date-picker>
  `,
})
export class SanpayGregorianDatePicker {
  readonly date = input<Date | undefined>();
  readonly defaultFocusedDate = input<Date | undefined>();
  readonly min = input<Date | undefined>();
  readonly max = input<Date | undefined>();
  readonly captionLayout = input<
    'dropdown' | 'label' | 'dropdown-months' | 'dropdown-years'
  >('label');
  readonly buttonId = input('sanpay-gregorian-date-picker');
  readonly triggerClass = input('w-full');
  readonly dateChange = output<Date | null>();
}
