import { Component, computed, inject, signal } from '@angular/core';
import { AdminStoreRow } from '@sanpay/models';
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

/** فروشگاه‌های طرف قرارداد: ثبت، ویرایش، کد QR صندوق و رمز پنل */
@Component({
  selector: 'app-stores',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTableImports,
  ],
  templateUrl: './stores.html',
})
export class StoresPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly canWrite = this.auth.canWrite;
  protected readonly toman = toman;
  protected readonly fa = fa;

  protected readonly rows = signal<AdminStoreRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 25;
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize)),
  );

  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly showForm = signal(false);
  protected readonly saving = signal(false);
  protected readonly form = signal({
    name: '',
    code: '',
    category: '',
    phone: '',
    address: '',
    logoUrl: '',
    latitude: '',
    longitude: '',
    settlementIban: '',
    settlementOwnerName: '',
    username: '',
    password: '',
  });

  /** فروشگاهی که ردیفش باز شده و در حال ویرایش است */
  protected readonly editingId = signal<string | null>(null);
  protected readonly editForm = signal({
    name: '',
    category: '',
    phone: '',
    address: '',
    logoUrl: '',
    latitude: '',
    longitude: '',
    settlementIban: '',
    settlementOwnerName: '',
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.api.stores({
        q: this.query().trim() || undefined,
        page: this.page(),
        pageSize: this.pageSize,
      });
      this.rows.set(result.items);
      this.total.set(result.total);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن فهرست فروشگاه‌ها ممکن نشد'));
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

  protected update(field: string, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  protected updateEdit(field: string, value: string): void {
    this.editForm.update((form) => ({ ...form, [field]: value }));
  }

  protected startEdit(row: AdminStoreRow): void {
    this.editingId.set(row.id);
    this.editForm.set({
      name: row.name,
      category: row.category ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
      logoUrl: row.logoUrl ?? '',
      latitude: row.latitude?.toString() ?? '',
      longitude: row.longitude?.toString() ?? '',
      settlementIban: row.settlementIban ?? '',
      settlementOwnerName: row.settlementOwnerName ?? '',
    });
  }

  protected async create(): Promise<void> {
    const form = this.form();
    await this.run(async () => {
      await this.api.createStore({
        name: form.name.trim(),
        code: form.code.trim().toUpperCase() || undefined,
        category: form.category.trim() || undefined,
        phone: form.phone.trim(),
        address: form.address.trim(),
        logoUrl: form.logoUrl || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        settlementIban: form.settlementIban.replace(/\s/g, '').toUpperCase(),
        settlementOwnerName: form.settlementOwnerName.trim() || undefined,
        username: form.username.trim().toLowerCase(),
        password: form.password,
      });
      this.showForm.set(false);
      this.form.set({
        name: '',
        code: '',
        category: '',
        phone: '',
        address: '',
        logoUrl: '',
        latitude: '',
        longitude: '',
        settlementIban: '',
        settlementOwnerName: '',
        username: '',
        password: '',
      });
      this.notice.set('فروشگاه ثبت شد.');
    }, 'ثبت فروشگاه ممکن نشد');
  }

  protected async saveEdit(id: string): Promise<void> {
    const form = this.editForm();
    await this.run(async () => {
      await this.api.updateStore(id, {
        name: form.name.trim(),
        category: form.category.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        logoUrl: form.logoUrl,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        settlementIban: form.settlementIban.replace(/\s/g, '').toUpperCase(),
        settlementOwnerName: form.settlementOwnerName.trim(),
      });
      this.editingId.set(null);
      this.notice.set('فروشگاه به‌روزرسانی شد.');
    }, 'ذخیرهٔ فروشگاه ممکن نشد');
  }

  protected async toggleActive(row: AdminStoreRow): Promise<void> {
    await this.run(async () => {
      await this.api.updateStore(row.id, { isActive: !row.isActive });
    }, 'تغییر وضعیت ممکن نشد');
  }

  protected async resetPassword(id: string, password: string): Promise<void> {
    if (password.trim().length < 8) {
      this.error.set('رمز جدید باید حداقل ۸ نویسه باشد');
      return;
    }
    await this.run(async () => {
      await this.api.resetStorePassword(id, password.trim());
      this.notice.set('رمز پنل فروشگاه بازنشانی شد.');
    }, 'بازنشانی رمز ممکن نشد');
  }

  protected async selectLogo(event: Event, editing = false): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 75_000
    ) {
      this.error.set('لوگو باید PNG، JPEG یا WebP و حداکثر ۷۵ کیلوبایت باشد');
      return;
    }
    const value = await fileToDataUrl(file);
    if (editing) this.updateEdit('logoUrl', value);
    else this.update('logoUrl', value);
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
