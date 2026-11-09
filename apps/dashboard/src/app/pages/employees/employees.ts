import { notifyError } from '../../core/notifications';
import { ConfirmService } from '../../core/confirm';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  AdminCompanyRow,
  AdminEmployeeRow,
  EmployeeImportEntry,
  OrganizationalRank,
} from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmSelectImports } from '@sanpay/ui/select';
import { HlmTableImports } from '@sanpay/ui/table';
import {
  AdminApiService,
  apiError,
  type Query,
} from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { ORGANIZATIONAL_RANK_LABELS, fa, toman } from '../../core/format';
import {
  parseEmployeeFile,
  parseBirthDate,
  employeeTemplateCsv,
} from '../../core/employee-file';

@Component({
  selector: 'app-employees',
  imports: [
    RouterModule,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmTableImports,
  ],
  templateUrl: './employees.html',
})
export class EmployeesPage {
  private readonly api = inject(AdminApiService);
  private readonly confirm = inject(ConfirmService);
  private readonly auth = inject(AdminAuthService);
  private loadVersion = 0;

  protected readonly canWrite = computed(() =>
    this.auth.hasPermission('employees:write'),
  );
  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly rankLabels = ORGANIZATIONAL_RANK_LABELS;
  protected readonly ranks: OrganizationalRank[] = [
    'CEO',
    'MANAGER',
    'DEPUTY',
    'HEAD',
    'EMPLOYEE',
  ];

  protected readonly rows = signal<AdminEmployeeRow[]>([]);
  protected readonly companies = signal<AdminCompanyRow[]>([]);
  protected readonly activeCompanies = computed(() =>
    this.companies().filter((company) => company.isActive),
  );
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly appliedFilters = signal<Query | null>(null);
  protected readonly importOpen = signal(false);
  protected readonly importCompanyId = signal('');
  protected readonly importEntries = signal<EmployeeImportEntry[]>([]);
  protected readonly importErrors = signal<string[]>([]);
  protected readonly importFileName = signal('');
  protected readonly importing = signal(false);
  protected readonly importNotice = signal<string | null>(null);

  /** تعداد صفحه‌ها — برای نمایش «صفحهٔ ۲ از ۷» */
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );

  protected readonly query = signal('');
  /** '' = همه، 'true' = فعال، 'false' = غیرفعال */
  protected readonly activeFilter = signal('');
  protected readonly companyFilter = signal('');

  protected readonly showForm = signal(false);
  protected readonly saving = signal(false);
  protected readonly form = signal({
    nationalCode: '',
    birthDay: '',
    birthMonth: '',
    birthYear: '',
    firstName: '',
    lastName: '',
    phone: '',
    companyId: '',
    organizationalRank: 'EMPLOYEE' as OrganizationalRank,
  });

  protected readonly companyLabel = (value: unknown): string =>
    this.companies().find((company) => company.id === value)?.name ??
    'انتخاب شرکت';

  protected readonly filterCompanyLabel = (value: unknown): string =>
    value ? this.companyLabel(value) : 'همهٔ شرکت‌ها';

  protected readonly rankLabel = (value: unknown): string =>
    ORGANIZATIONAL_RANK_LABELS[String(value)] ?? 'انتخاب رده';

  constructor() {
    void this.load();
    void this.loadCompanies();
  }

  private async loadCompanies(): Promise<void> {
    const pageSize = 200;
    const companies: AdminCompanyRow[] = [];
    try {
      for (let page = 1; ; page++) {
        const result = await this.api.companies({ page, pageSize });
        companies.push(...result.items);
        if (page * pageSize >= result.total) break;
      }
      this.companies.set(companies);
    } catch (caught) {
      notifyError(apiError(caught, 'خواندن فهرست شرکت‌ها ممکن نشد'));
    }
  }

  protected async load(): Promise<void> {
    const version = ++this.loadVersion;
    this.loading.set(true);
    const filters = {
      q: this.query().trim() || undefined,
      active: this.activeFilter() || undefined,
      companyId: this.companyFilter() || undefined,
    };
    try {
      const result = await this.api.employees({
        ...filters,
        page: this.page(),
        pageSize: this.pageSize,
      });
      if (version !== this.loadVersion) return;
      this.total.set(result.total);
      if (result.page > this.pageCount()) {
        this.page.set(this.pageCount());
        await this.load();
        return;
      }
      this.rows.set(result.items);
      this.appliedFilters.set(filters);
    } catch (caught) {
      if (version !== this.loadVersion) return;
      this.rows.set([]);
      this.appliedFilters.set(null);
      this.total.set(0);
      this.page.set(1);
      notifyError(apiError(caught, 'خواندن فهرست کارمندان ممکن نشد'));
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }

  protected async exportExcel(): Promise<void> {
    const filters = this.appliedFilters();
    if (!filters || this.loading() || this.exporting()) return;

    this.exporting.set(true);
    try {
      await this.api.downloadEmployeesExcel(filters);
    } catch (caught) {
      notifyError(apiError(caught, 'ساخت خروجی اکسل ممکن نشد'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected setFilter(value: string): void {
    this.activeFilter.set(value);
    this.search();
  }

  protected setCompanyFilter(value: string): void {
    this.companyFilter.set(value);
    this.search();
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || (next - 1) * this.pageSize >= this.total()) return;
    this.page.set(next);
    void this.load();
  }

  protected update(field: string, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  protected async create(): Promise<void> {
    const form = this.form();
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.api.createEmployee({
        nationalCode: form.nationalCode.trim(),
        birthDate: parseBirthDate(
          form.birthYear,
          form.birthMonth,
          form.birthDay,
        ),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        companyId: form.companyId,
        organizationalRank: form.organizationalRank,
      });
      this.showForm.set(false);
      this.form.set({
        nationalCode: '',
        birthDay: '',
        birthMonth: '',
        birthYear: '',
        firstName: '',
        lastName: '',
        phone: '',
        companyId: '',
        organizationalRank: 'EMPLOYEE',
      });
      this.page.set(1);
      await this.load();
    } catch (caught) {
      notifyError(apiError(caught, 'ثبت کارمند ممکن نشد'));
    } finally {
      this.saving.set(false);
    }
  }

  protected downloadTemplate(): void {
    const url = URL.createObjectURL(
      new Blob([employeeTemplateCsv()], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sanpay-employees-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected async deleteEmployee(row: AdminEmployeeRow): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'حذف کارمند',
      description: `کارمند «${row.firstName} ${row.lastName}» حذف شود؟ دسترسی او بسته و سوابق مالی حفظ می‌شود.`,
      action: 'حذف',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await this.api.deleteEmployee(row.id);
      await this.load();
    } catch (caught) {
      notifyError(apiError(caught, 'حذف کارمند ممکن نشد'));
    }
  }

  protected async selectImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    this.importNotice.set(null);
    try {
      const result = await parseEmployeeFile(file);
      this.importEntries.set(result.entries);
      this.importErrors.set(result.errors);
    } catch {
      this.importEntries.set([]);
      this.importErrors.set([
        'خواندن فایل ممکن نشد؛ فایل CSV یا XLSX معتبر انتخاب کنید',
      ]);
    } finally {
      input.value = '';
    }
  }

  protected async importEmployees(): Promise<void> {
    if (
      this.importing() ||
      !this.importCompanyId() ||
      !this.importEntries().length
    ) {
      return;
    }
    this.importing.set(true);
    this.importNotice.set(null);
    try {
      const result = await this.api.importEmployees({
        companyId: this.importCompanyId(),
        entries: this.importEntries(),
      });
      const rejected = result.rejected.map(
        (row) => `سطر ${row.rowNumber}: ${row.reason}`,
      );
      this.importErrors.set(rejected);
      this.importEntries.set([]);
      this.importNotice.set(
        `${fa(result.created)} کارمند ثبت شد${rejected.length ? ` و ${fa(rejected.length)} سطر رد شد` : ''}.`,
      );
      this.page.set(1);
      await this.load();
    } catch (caught) {
      this.importErrors.set([apiError(caught, 'ورود گروهی کارمندان ممکن نشد')]);
    } finally {
      this.importing.set(false);
    }
  }

  /** فعال/غیرفعال کردن سریع از داخل جدول */
  protected async toggleActive(row: AdminEmployeeRow): Promise<void> {
    try {
      await this.api.updateEmployee(row.id, { isActive: !row.isActive });
      await this.load();
    } catch (caught) {
      notifyError(apiError(caught, 'تغییر وضعیت ممکن نشد'));
    }
  }
}
