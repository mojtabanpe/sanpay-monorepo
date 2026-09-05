import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  AdminCompanyRow,
  AdminEmployeeDetail,
  AdminWalletDefinitionRow,
  OrganizationalRank,
} from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmTableImports } from '@sanpay/ui/table';
import { SanpayDatePickerWidth, isoToJalali, jalaliToIso } from '@sanpay/dates';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import {
  WALLET_KIND_LABELS,
  ORGANIZATIONAL_RANK_LABELS,
  fa,
  isoDate,
  jalali,
  jalaliTime,
  parseAmount,
  toman,
} from '../../core/format';

/**
 * پروندهٔ کارمند: اطلاعات هویتی، کیف‌پول‌ها (تخصیص/ویرایش/اصلاح مانده)،
 * بازنشانی رمز و تاریخچهٔ خرید.
 */
@Component({
  selector: 'app-employee-detail',
  imports: [
    SanpayDatePickerWidth,
    RouterModule,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmTableImports,
  ],
  templateUrl: './employee-detail.html',
})
export class EmployeeDetailPage {
  /** از پارامتر مسیر `/employees/:id` (withComponentInputBinding) */
  readonly id = input.required<string>();

  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly canWrite = this.auth.canWrite;
  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly jalali = jalali;
  protected readonly jalaliTime = jalaliTime;
  protected readonly kindLabels = WALLET_KIND_LABELS;
  protected readonly rankLabels = ORGANIZATIONAL_RANK_LABELS;
  protected readonly ranks: OrganizationalRank[] = [
    'MANAGER',
    'DEPUTY',
    'HEAD',
    'EMPLOYEE',
  ];

  protected readonly employee = signal<AdminEmployeeDetail | null>(null);
  protected readonly definitions = signal<AdminWalletDefinitionRow[]>([]);
  protected readonly companies = signal<AdminCompanyRow[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly saving = signal(false);

  /** فرم ویرایش اطلاعات */
  protected readonly editing = signal(false);
  protected readonly editForm = signal({
    firstName: '',
    lastName: '',
    phone: '',
    companyId: '',
    organizationalRank: 'EMPLOYEE' as OrganizationalRank,
  });

  /** فرم تخصیص کیف پول */
  protected readonly allocForm = signal({
    definitionId: '',
    cap: '',
    expiresAt: defaultExpiry(),
  });

  protected readonly newPassword = signal('');

  /** تاریخ انقضای فرم تخصیص، به شکلی که تاریخ‌گزین شمسی می‌خواهد */
  protected readonly allocExpiry = computed(() =>
    isoToJalali(this.allocForm().expiresAt),
  );

  /** حداقل انتخاب: امروز — تخصیص با تاریخ گذشته بی‌معنی است */
  protected readonly minDate = isoToJalali(isoDate(new Date()));

  protected jalaliOf(iso: string): JalaliDate {
    return isoToJalali(iso.slice(0, 10));
  }

  protected onAllocExpiryChange(date: JalaliDate | undefined): void {
    if (date) this.updateAlloc('expiresAt', jalaliToIso(date));
  }

  protected onRowExpiryChange(
    allocationId: string,
    date: JalaliDate | undefined,
  ): void {
    if (date) void this.setExpiry(allocationId, jalaliToIso(date));
  }

  protected readonly totals = computed(() => {
    const allocations = this.employee()?.allocations ?? [];
    const active = allocations.filter(
      (allocation) =>
        allocation.isActive && new Date(allocation.expiresAt) > new Date(),
    );
    return {
      cap: active.reduce((sum, a) => sum + a.cap, 0),
      remaining: active.reduce((sum, a) => sum + a.remaining, 0),
    };
  });

  constructor() {
    void this.load();
  }

  protected definitionLabel = (value: unknown): string =>
    this.definitions().find((definition) => definition.id === value)?.name ??
    'انتخاب کیف پول';

  protected readonly companyLabel = (value: unknown): string =>
    this.companies().find((company) => company.id === value)?.name ??
    'انتخاب شرکت';

  protected readonly rankLabel = (value: unknown): string =>
    ORGANIZATIONAL_RANK_LABELS[String(value)] ?? 'انتخاب رده';

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      const employee = await this.api.employee(this.id());
      const [definitions, companies] = await Promise.all([
        this.api.walletDefinitions({
          active: 'true',
          companyId: employee.company.id,
          pageSize: 200,
        }),
        this.api.companies({ active: 'true', pageSize: 200 }),
      ]);
      this.employee.set(employee);
      this.definitions.set(definitions.items);
      this.companies.set(companies.items);
      this.editForm.set({
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone ?? '',
        companyId: employee.company.id,
        organizationalRank: employee.organizationalRank,
      });
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن اطلاعات کارمند ممکن نشد'));
    }
  }

  protected updateEdit(field: string, value: string): void {
    this.editForm.update((form) => ({ ...form, [field]: value }));
  }

  protected updateAlloc(field: string, value: string): void {
    this.allocForm.update((form) => ({ ...form, [field]: value }));
  }

  protected async saveProfile(): Promise<void> {
    await this.run(async () => {
      const form = this.editForm();
      await this.api.updateEmployee(this.id(), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        companyId: form.companyId,
        organizationalRank: form.organizationalRank,
      });
      this.editing.set(false);
      this.notice.set('اطلاعات کارمند به‌روزرسانی شد.');
    }, 'ذخیرهٔ اطلاعات ممکن نشد');
  }

  protected async toggleActive(): Promise<void> {
    const employee = this.employee();
    if (!employee) return;
    await this.run(async () => {
      await this.api.updateEmployee(employee.id, {
        isActive: !employee.isActive,
      });
      this.notice.set(
        employee.isActive ? 'کارمند غیرفعال شد.' : 'کارمند فعال شد.',
      );
    }, 'تغییر وضعیت ممکن نشد');
  }

  protected async resetPassword(): Promise<void> {
    const password = this.newPassword().trim();
    if (password.length < 8) {
      this.error.set('رمز جدید باید حداقل ۸ نویسه باشد');
      return;
    }
    await this.run(async () => {
      await this.api.resetEmployeePassword(this.id(), password);
      this.newPassword.set('');
      this.notice.set('رمز عبور کارمند بازنشانی شد.');
    }, 'بازنشانی رمز ممکن نشد');
  }

  protected async addAllocation(): Promise<void> {
    const form = this.allocForm();
    if (!form.definitionId) {
      this.error.set('کیف پول را انتخاب کنید');
      return;
    }
    await this.run(async () => {
      await this.api.addAllocation(this.id(), {
        definitionId: form.definitionId,
        cap: parseAmount(form.cap),
        expiresAt: form.expiresAt,
      });
      this.allocForm.set({
        definitionId: '',
        cap: '',
        expiresAt: defaultExpiry(),
      });
      this.notice.set('کیف پول به کارمند تخصیص یافت.');
    }, 'تخصیص کیف پول ممکن نشد');
  }

  protected async setCap(allocationId: string, raw: string): Promise<void> {
    await this.run(async () => {
      await this.api.updateAllocation(allocationId, { cap: parseAmount(raw) });
      this.notice.set('سقف اعتبار به‌روزرسانی شد.');
    }, 'تغییر سقف ممکن نشد');
  }

  protected async setExpiry(
    allocationId: string,
    value: string,
  ): Promise<void> {
    if (!value) return;
    await this.run(async () => {
      await this.api.updateAllocation(allocationId, { expiresAt: value });
      this.notice.set('تاریخ انقضا به‌روزرسانی شد.');
    }, 'تغییر تاریخ انقضا ممکن نشد');
  }

  protected async toggleAllocation(
    allocationId: string,
    isActive: boolean,
  ): Promise<void> {
    await this.run(async () => {
      await this.api.updateAllocation(allocationId, { isActive: !isActive });
    }, 'تغییر وضعیت کیف پول ممکن نشد');
  }

  /** برگشت دستی اعتبار به کیف پول (مثلاً بابت خرید اشتباه) */
  protected async refund(allocationId: string, raw: string): Promise<void> {
    const amount = parseAmount(raw);
    if (amount <= 0) {
      this.error.set('مبلغ برگشتی را وارد کنید');
      return;
    }
    await this.run(async () => {
      await this.api.adjustAllocation(
        allocationId,
        amount,
        'برگشت دستی از داشبورد',
      );
      this.notice.set('مبلغ به کیف پول برگشت داده شد.');
    }, 'برگشت مبلغ ممکن نشد');
  }

  /** اجرای یک عملیات با مدیریت خطا و بارگذاری دوباره */
  private async run(
    action: () => Promise<void>,
    fallback: string,
  ): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
      await this.load();
    } catch (caught) {
      this.error.set(apiError(caught, fallback));
    } finally {
      this.saving.set(false);
    }
  }
}

/** پیش‌فرض انقضا: پایان سال میلادی جاری — مدیر می‌تواند عوضش کند */
function defaultExpiry(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return isoDate(date);
}
