import { Component, inject, signal } from '@angular/core';
import { AdminProfile } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmTableImports } from '@sanpay/ui/table';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { ADMIN_ROLE_LABELS, jalaliTime } from '../../core/format';

/** کاربران داشبورد — فقط مدیر ارشد به این صفحه دسترسی دارد */
@Component({
  selector: 'app-admins',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTableImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './admins.html',
})
export class AdminsPage {
  private readonly api = inject(AdminApiService);

  protected readonly roleLabels = ADMIN_ROLE_LABELS;
  protected readonly roles = ['SUPER_ADMIN', 'ADMIN', 'VIEWER'];
  protected readonly jalaliTime = jalaliTime;

  protected readonly rows = signal<AdminProfile[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly form = signal({
    username: '',
    name: '',
    password: '',
    role: 'ADMIN',
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this.rows.set(await this.api.admins());
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن کاربران داشبورد ممکن نشد'));
    }
  }

  protected update(field: string, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  protected async create(): Promise<void> {
    const form = this.form();
    await this.run(async () => {
      await this.api.createAdmin({
        username: form.username.trim().toLowerCase(),
        name: form.name.trim(),
        password: form.password,
        role: form.role,
      });
      this.form.set({ username: '', name: '', password: '', role: 'ADMIN' });
      this.notice.set('کاربر داشبورد ساخته شد.');
    }, 'ساخت کاربر ممکن نشد');
  }

  protected async setRole(id: string, role: string | undefined): Promise<void> {
    if (!role) return;
    await this.run(async () => {
      await this.api.updateAdmin(id, { role });
    }, 'تغییر نقش ممکن نشد');
  }

  protected async toggleActive(row: AdminProfile): Promise<void> {
    await this.run(async () => {
      await this.api.updateAdmin(row.id, { isActive: !row.isActive });
    }, 'تغییر وضعیت ممکن نشد');
  }

  protected async resetPassword(id: string, password: string): Promise<void> {
    if (password.trim().length < 8) {
      this.error.set('رمز جدید باید حداقل ۸ نویسه باشد');
      return;
    }
    await this.run(async () => {
      await this.api.resetAdminPassword(id, password.trim());
      this.notice.set('رمز کاربر بازنشانی شد.');
    }, 'بازنشانی رمز ممکن نشد');
  }

  private async run(action: () => Promise<void>, fallback: string): Promise<void> {
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
