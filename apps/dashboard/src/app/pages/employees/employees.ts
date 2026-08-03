import { Component, computed, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AdminEmployeeRow } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmTableImports } from '@sanpay/ui/table';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { fa, toman } from '../../core/format';

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
    HlmTableImports,
  ],
  templateUrl: './employees.html',
})
export class EmployeesPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly canWrite = this.auth.canWrite;
  protected readonly toman = toman;
  protected readonly fa = fa;

  protected readonly rows = signal<AdminEmployeeRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** تعداد صفحه‌ها — برای نمایش «صفحهٔ ۲ از ۷» */
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );

  protected readonly query = signal('');
  /** '' = همه، 'true' = فعال، 'false' = غیرفعال */
  protected readonly activeFilter = signal('');

  protected readonly showForm = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly form = signal({
    nationalCode: '',
    personnelCode: '',
    firstName: '',
    lastName: '',
    phone: '',
    password: '',
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.employees({
        q: this.query().trim() || undefined,
        active: this.activeFilter() || undefined,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن فهرست کارمندان ممکن نشد'));
    } finally {
      this.loading.set(false);
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
    this.formError.set(null);
    try {
      await this.api.createEmployee({
        nationalCode: form.nationalCode.trim(),
        personnelCode: form.personnelCode.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password.trim() || undefined,
      });
      this.showForm.set(false);
      this.form.set({
        nationalCode: '',
        personnelCode: '',
        firstName: '',
        lastName: '',
        phone: '',
        password: '',
      });
      this.page.set(1);
      await this.load();
    } catch (caught) {
      this.formError.set(apiError(caught, 'ثبت کارمند ممکن نشد'));
    } finally {
      this.saving.set(false);
    }
  }

  /** فعال/غیرفعال کردن سریع از داخل جدول */
  protected async toggleActive(row: AdminEmployeeRow): Promise<void> {
    try {
      await this.api.updateEmployee(row.id, { isActive: !row.isActive });
      await this.load();
    } catch (caught) {
      this.error.set(apiError(caught, 'تغییر وضعیت ممکن نشد'));
    }
  }
}
