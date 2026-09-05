import { Component, computed, inject, signal } from '@angular/core';
import { AdminCompanyRow } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmTableImports } from '@sanpay/ui/table';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { fa } from '../../core/format';

@Component({
  selector: 'app-companies',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTableImports,
  ],
  templateUrl: './companies.html',
})
export class CompaniesPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly canWrite = this.auth.canWrite;
  protected readonly fa = fa;
  protected readonly rows = signal<AdminCompanyRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly showForm = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly name = signal('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.companies({
        q: this.query().trim() || undefined,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن فهرست شرکت‌ها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected search(): void {
    this.page.set(1);
    void this.load();
  }

  protected changePage(delta: number): void {
    const next = this.page() + delta;
    if (next < 1 || (next - 1) * this.pageSize >= this.total()) return;
    this.page.set(next);
    void this.load();
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.name.set('');
    this.showForm.set(true);
  }

  protected startEdit(company: AdminCompanyRow): void {
    this.editingId.set(company.id);
    this.name.set(company.name);
    this.showForm.set(true);
  }

  protected async save(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.saving()) return;
    await this.run(async () => {
      const id = this.editingId();
      if (id) {
        await this.api.updateCompany(id, { name });
        this.notice.set('شرکت به‌روزرسانی شد.');
      } else {
        await this.api.createCompany({ name });
        this.notice.set('شرکت ساخته شد.');
      }
      this.showForm.set(false);
      this.editingId.set(null);
      this.name.set('');
    }, 'ذخیرهٔ شرکت ممکن نشد');
  }

  protected async toggleActive(company: AdminCompanyRow): Promise<void> {
    await this.run(async () => {
      await this.api.updateCompany(company.id, { isActive: !company.isActive });
      this.notice.set(company.isActive ? 'شرکت غیرفعال شد.' : 'شرکت فعال شد.');
    }, 'تغییر وضعیت شرکت ممکن نشد');
  }

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
