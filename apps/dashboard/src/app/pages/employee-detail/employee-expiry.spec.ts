import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { providePersianDates, jalaliToIso } from '@sanpay/dates';
import { AdminEmployeeDetail } from '@sanpay/models';
import { HlmCalendar } from '@sanpay/ui/calendar';
import { HlmDatePicker, HlmDatePickerTrigger } from '@sanpay/ui/date-picker';
import {
  BrnCalendar,
  BrnCalendarMonthSelect,
  BrnCalendarYearSelect,
} from '@spartan-ng/brain/calendar';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { BrnSelect } from '@spartan-ng/brain/select';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { ConfirmService } from '../../core/confirm';
import { EmployeeDetailPage } from './employee-detail';

@Component({
  imports: [HlmCalendar],
  template: '<hlm-calendar captionLayout="dropdown" [date]="date" />',
})
class CalendarHost {
  readonly date = new JalaliDate(1405, 1, 15);
}

@Component({
  imports: [HlmDatePicker, HlmDatePickerTrigger],
  template: `
    <hlm-date-picker captionLayout="dropdown" [date]="date">
      <hlm-date-picker-trigger>انتخاب تاریخ</hlm-date-picker-trigger>
    </hlm-date-picker>
  `,
})
class DatePickerHost {
  readonly date = new JalaliDate(1405, 1, 15);
}

const employee: AdminEmployeeDetail = {
  id: 'employee-1',
  nationalCode: '0012345678',
  personnelCode: 'P1',
  firstName: 'علی',
  lastName: 'رضایی',
  phone: '09123456789',
  company: { id: 'company-1', name: 'شرکت' },
  organizationalRank: 'EMPLOYEE',
  isActive: true,
  createdAt: '2026-01-01',
  walletCount: 1,
  remaining: 100,
  hasPassword: true,
  totalSpent: 0,
  payments: [],
  allocations: [
    {
      id: 'wallet-1',
      definitionId: 'definition-1',
      definitionName: 'رفاهی',
      kind: 'CREDIT',
      icon: null,
      cap: 100,
      spent: 0,
      remaining: 100,
      expiresAt: '2027-03-20',
      isActive: true,
      createdAt: '2026-01-01',
    },
  ],
};

describe('wallet expiry date picker', () => {
  const originalScrollIntoView = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollIntoView',
  );
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalScrollIntoView) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        originalScrollIntoView,
      );
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });

  it('changes the focused Jalali month and year through the select controls', async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarHost],
      providers: [providePersianDates()],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarHost);
    await fixture.whenStable();
    const month = fixture.debugElement.query(
      By.directive(BrnCalendarMonthSelect),
    );
    const year = fixture.debugElement.query(
      By.directive(BrnCalendarYearSelect),
    );
    expect(month).toBeTruthy();
    expect(year).toBeTruthy();
    const calendar = fixture.debugElement
      .query(By.directive(HlmCalendar))
      .injector.get(BrnCalendar<JalaliDate>);
    month.injector.get(BrnSelect<string>).select('مهر');
    year.injector.get(BrnSelect<number>).select(1406);
    await fixture.whenStable();
    expect(calendar.focusedDate().year).toBe(1406);
    expect(calendar.focusedDate().month).toBe(7);
    expect(
      fixture.nativeElement.querySelector('[brnCalendarMonthSelect] button')
        ?.textContent,
    ).toContain('ماه');
    expect(
      fixture.nativeElement.querySelector('[brnCalendarYearSelect] button')
        ?.textContent,
    ).toContain('سال');
  });

  it('allows selecting month and year from the nested date-picker popovers', async () => {
    await TestBed.configureTestingModule({
      imports: [DatePickerHost],
      providers: [providePersianDates()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DatePickerHost);
    await fixture.whenStable();
    const trigger: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    expect(trigger).toBeTruthy();
    trigger.click();
    await fixture.whenStable();

    const month = document.querySelector<HTMLButtonElement>(
      '[brnCalendarMonthSelect] button',
    );
    expect(month).toBeTruthy();
    month?.click();
    await fixture.whenStable();
    const monthOption = document.querySelector<HTMLElement>(
      '[role="option"][data-value="مهر"]',
    );
    expect(monthOption).toBeTruthy();
    monthOption?.click();
    await fixture.whenStable();
    expect(
      document.querySelector('[brnCalendarMonthSelect] button')?.textContent,
    ).toContain('مهر');

    const year = document.querySelector<HTMLButtonElement>(
      '[brnCalendarYearSelect] button',
    );
    expect(year).toBeTruthy();
    year?.click();
    await fixture.whenStable();
    const yearOption = document.querySelector<HTMLElement>(
      '[role="option"][data-value="1406"]',
    );
    expect(yearOption).toBeTruthy();
    yearOption?.click();
    await fixture.whenStable();
    expect(
      document.querySelector('[brnCalendarHeader]')?.textContent,
    ).toContain('مهر');
    expect(
      document.querySelector('[brnCalendarHeader]')?.textContent,
    ).toContain('۱۴۰۶');
  });

  it('enables month/year navigation and saves the selected date for an existing wallet', async () => {
    const api = {
      employee: vi.fn().mockResolvedValue(employee),
      walletDefinitions: vi.fn().mockResolvedValue({ items: [] }),
      companies: vi.fn().mockResolvedValue({ items: [] }),
      updateAllocation: vi.fn().mockResolvedValue({}),
    };
    await TestBed.configureTestingModule({
      imports: [EmployeeDetailPage],
      providers: [
        provideRouter([]),
        providePersianDates(),
        { provide: AdminApiService, useValue: api },
        { provide: AdminAuthService, useValue: { hasPermission: () => true } },
        { provide: ConfirmService, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EmployeeDetailPage);
    fixture.componentRef.setInput('id', employee.id);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(
        fixture.debugElement.queryAll(By.directive(HlmDatePicker)),
      ).toHaveLength(2);
    });
    const pickers = fixture.debugElement.queryAll(By.directive(HlmDatePicker));
    expect(pickers).toHaveLength(2);
    const rowPicker = pickers[1].injector.get(HlmDatePicker<JalaliDate>);
    expect(rowPicker.captionLayout()).toBe('dropdown');
    const selected = new JalaliDate(1406, 7, 15);
    rowPicker.dateChange.emit(selected);
    await fixture.whenStable();
    expect(api.updateAllocation).toHaveBeenCalledWith('wallet-1', {
      expiresAt: jalaliToIso(selected),
    });
  });

  it('keeps the year picked from the dropdown in an existing wallet row', async () => {
    const api = {
      employee: vi.fn().mockResolvedValue(employee),
      walletDefinitions: vi.fn().mockResolvedValue({ items: [] }),
      companies: vi.fn().mockResolvedValue({ items: [] }),
      updateAllocation: vi.fn().mockResolvedValue({}),
    };
    await TestBed.configureTestingModule({
      imports: [EmployeeDetailPage],
      providers: [
        provideRouter([]),
        providePersianDates(),
        { provide: AdminApiService, useValue: api },
        { provide: AdminAuthService, useValue: { hasPermission: () => true } },
        { provide: ConfirmService, useValue: {} },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EmployeeDetailPage);
    fixture.componentRef.setInput('id', employee.id);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => {
      expect(
        fixture.debugElement.queryAll(By.directive(HlmDatePicker)),
      ).toHaveLength(2);
    });
    const rowPicker = fixture.debugElement
      .queryAll(By.directive(HlmDatePicker))[1]
      .injector.get(HlmDatePicker<JalaliDate>);
    rowPicker.open();
    await fixture.whenStable();
    // the row's [date] used to be a fresh object per change detection,
    // which reset the calendar to the saved date right after a year pick
    const header = () =>
      document.querySelector('[brnCalendarHeader]')?.textContent ?? '';
    const yearButton = document.querySelector<HTMLButtonElement>(
      '[brnCalendarYearSelect] button',
    );
    yearButton?.click();
    await fixture.whenStable();
    document
      .querySelector<HTMLElement>('[role="option"][data-value="1407"]')
      ?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(header()).toContain('۱۴۰۷');
  });
});
