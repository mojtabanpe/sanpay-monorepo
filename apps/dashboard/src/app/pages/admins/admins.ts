import { Component, inject, signal } from '@angular/core';
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_GROUPS,
  AdminPermission,
  AdminProfile,
  AdminResource,
  normalizeAdminPermissions,
} from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmDialogImports } from '@sanpay/ui/dialog';
import { HlmCheckboxImports } from '@sanpay/ui/checkbox';
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
    HlmDialogImports,
    HlmCheckboxImports,
    HlmInputImports,
    HlmTableImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './admins.html',
})
export class AdminsPage {
  private readonly api = inject(AdminApiService);

  protected readonly roleLabels = ADMIN_ROLE_LABELS;
  /** مدیر ارشد اینجا نیست: نه در فهرست، نه قابل انتخاب (API هم نمی‌پذیرد) */
  protected readonly roles = ['ADMIN', 'VIEWER'];
  protected readonly jalaliTime = jalaliTime;

  protected readonly allPermissions = ADMIN_PERMISSIONS;
  protected readonly permissionGroups = ADMIN_PERMISSION_GROUPS;
  protected readonly formPermissions = signal<AdminPermission[]>([
    ...ADMIN_PERMISSIONS,
  ]);
  protected readonly permissionDraft = signal<AdminPermission[]>([]);
  protected readonly permissionTarget = signal<AdminProfile | null>(null);
  protected readonly permissionsOpen = signal<'open' | 'closed'>('closed');
  protected readonly permissionError = signal<string | null>(null);

  protected openPermissions(row: AdminProfile | null): void {
    this.permissionTarget.set(row);
    this.permissionDraft.set([...(row?.permissions ?? this.formPermissions())]);
    this.permissionError.set(null);
    this.permissionsOpen.set('open');
  }

  protected permissionChecked(
    resource: AdminResource,
    action: 'read' | 'write',
  ): boolean {
    return this.permissionDraft().includes(`${resource}:${action}`);
  }

  protected togglePermission(
    resource: AdminResource,
    action: 'read' | 'write',
    checked: boolean,
  ): void {
    const permission: AdminPermission = `${resource}:${action}`;
    let draft = this.permissionDraft().filter((item) => item !== permission);
    if (checked) draft.push(permission);
    if (!checked && action === 'read')
      draft = draft.filter((item) => item !== `${resource}:write`);
    this.permissionDraft.set(normalizeAdminPermissions(draft));
  }

  protected async savePermissions(): Promise<void> {
    if (this.saving()) return;
    const row = this.permissionTarget();
    if (!row) {
      this.formPermissions.set([...this.permissionDraft()]);
      this.permissionsOpen.set('closed');
      return;
    }
    this.saving.set(true);
    this.permissionError.set(null);
    try {
      await this.api.updateAdmin(row.id, {
        permissions: this.permissionDraft(),
      });
      await this.load();
      this.permissionsOpen.set('closed');
      this.notice.set(`دسترسی‌های ${row.name} ذخیره شد.`);
    } catch (caught) {
      this.permissionError.set(apiError(caught, 'ذخیرهٔ دسترسی‌ها ممکن نشد'));
    } finally {
      this.saving.set(false);
    }
  }

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
        permissions: this.formPermissions(),
      });
      this.form.set({ username: '', name: '', password: '', role: 'ADMIN' });
      this.formPermissions.set([...ADMIN_PERMISSIONS]);
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

  protected async resetPassword(
    id: string,
    input: HTMLInputElement,
  ): Promise<void> {
    const password = input.value;
    if (password.length < 8) {
      this.error.set('رمز جدید باید حداقل ۸ نویسه باشد');
      return;
    }
    const saved = await this.run(async () => {
      await this.api.resetAdminPassword(id, password);
      this.notice.set('رمز جدید ذخیره شد؛ از این پس با همین رمز وارد شوید.');
    }, 'ذخیرهٔ رمز ممکن نشد');
    if (saved) input.value = '';
  }

  private async run(
    action: () => Promise<void>,
    fallback: string,
  ): Promise<boolean> {
    if (this.saving()) return false;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
      await this.load();
      return true;
    } catch (caught) {
      this.error.set(apiError(caught, fallback));
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
