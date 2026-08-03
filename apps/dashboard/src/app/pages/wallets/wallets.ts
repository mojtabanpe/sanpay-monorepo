import { Component, computed, inject, signal } from '@angular/core';
import { isoToJalali, jalaliToIso } from '@sanpay/dates';
import { AdminStoreRow, AdminWalletDefinitionRow } from '@sanpay/models';
import { HlmAlertImports } from '@sanpay/ui/alert';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmCheckboxImports } from '@sanpay/ui/checkbox';
import { HlmDatePickerImports } from '@sanpay/ui/date-picker';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmInputImports } from '@sanpay/ui/input';
import { HlmLabelImports } from '@sanpay/ui/label';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { JalaliDate } from '@spartan-ng/brain/date-time';
import { AdminApiService, apiError } from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { WALLET_KIND_LABELS, fa, isoDate, parseAmount, toman } from '../../core/format';

type Kind = 'CREDIT' | 'RATION' | 'TOURISM';

/**
 * تعریف کیف‌پول‌ها: نوع، سقف پیش‌فرض، فروشگاه‌های مجاز و تخصیص گروهی.
 * کیف پول گردشگری فروشگاه ندارد — انتخاب فروشگاه برایش پنهان می‌شود.
 */
@Component({
  selector: 'app-wallets',
  imports: [
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmCheckboxImports,
    HlmDatePickerImports,
    HlmFieldImports,
    HlmInputImports,
    HlmLabelImports,
    HlmToggleGroupImports,
  ],
  templateUrl: './wallets.html',
})
export class WalletsPage {
  private readonly api = inject(AdminApiService);
  private readonly auth = inject(AdminAuthService);

  protected readonly canWrite = this.auth.canWrite;
  protected readonly toman = toman;
  protected readonly fa = fa;
  protected readonly kindLabels = WALLET_KIND_LABELS;
  protected readonly kinds: Kind[] = ['CREDIT', 'RATION', 'TOURISM'];

  protected readonly definitions = signal<AdminWalletDefinitionRow[]>([]);
  protected readonly stores = signal<AdminStoreRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  /** فرم ساخت/ویرایش — `editingId` خالی یعنی ساخت تازه */
  protected readonly editingId = signal<string | null>(null);
  protected readonly showForm = signal(false);
  protected readonly form = signal({
    name: '',
    kind: 'CREDIT' as Kind,
    description: '',
    icon: '',
    defaultCap: '',
    storeIds: [] as string[],
  });

  /** فرم تخصیص گروهی */
  protected readonly bulkFor = signal<AdminWalletDefinitionRow | null>(null);
  protected readonly bulkCap = signal('');
  protected readonly bulkExpiry = signal(defaultExpiry());
  protected readonly bulkExpiryDate = computed(() => isoToJalali(this.bulkExpiry()));
  protected readonly minDate = isoToJalali(isoDate(new Date()));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [definitions, stores] = await Promise.all([
        this.api.walletDefinitions({ pageSize: 200 }),
        this.api.stores({ pageSize: 200 }),
      ]);
      this.definitions.set(definitions.items);
      this.stores.set(stores.items);
    } catch (caught) {
      this.error.set(apiError(caught, 'خواندن کیف‌پول‌ها ممکن نشد'));
    } finally {
      this.loading.set(false);
    }
  }

  protected update(field: string, value: string): void {
    this.form.update((form) => ({ ...form, [field]: value }));
  }

  protected setKind(kind: string | undefined): void {
    if (!kind) return;
    // گردشگری فروشگاه ندارد؛ انتخاب‌های قبلی پاک می‌شود تا سرور ردش نکند
    this.form.update((form) => ({
      ...form,
      kind: kind as Kind,
      storeIds: kind === 'TOURISM' ? [] : form.storeIds,
    }));
  }

  protected isStoreSelected(storeId: string): boolean {
    return this.form().storeIds.includes(storeId);
  }

  protected toggleStore(storeId: string): void {
    this.form.update((form) => ({
      ...form,
      storeIds: form.storeIds.includes(storeId)
        ? form.storeIds.filter((id) => id !== storeId)
        : [...form.storeIds, storeId],
    }));
  }

  protected startCreate(): void {
    this.editingId.set(null);
    this.form.set({
      name: '',
      kind: 'CREDIT',
      description: '',
      icon: '',
      defaultCap: '',
      storeIds: [],
    });
    this.showForm.set(true);
  }

  protected startEdit(definition: AdminWalletDefinitionRow): void {
    this.editingId.set(definition.id);
    this.form.set({
      name: definition.name,
      kind: definition.kind as Kind,
      description: definition.description ?? '',
      icon: definition.icon ?? '',
      defaultCap: definition.defaultCap === null ? '' : String(definition.defaultCap),
      storeIds: definition.stores.map((store) => store.id),
    });
    this.showForm.set(true);
  }

  protected async save(): Promise<void> {
    const form = this.form();
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      description: form.description.trim() || undefined,
      icon: form.icon.trim() || undefined,
      defaultCap: form.defaultCap ? parseAmount(form.defaultCap) : undefined,
      storeIds: form.kind === 'TOURISM' ? [] : form.storeIds,
    };

    await this.run(async () => {
      const id = this.editingId();
      if (id) {
        await this.api.updateWalletDefinition(id, payload);
        this.notice.set('کیف پول به‌روزرسانی شد.');
      } else {
        await this.api.createWalletDefinition(payload);
        this.notice.set('کیف پول ساخته شد.');
      }
      this.showForm.set(false);
      this.editingId.set(null);
    }, 'ذخیرهٔ کیف پول ممکن نشد');
  }

  protected async toggleActive(definition: AdminWalletDefinitionRow): Promise<void> {
    await this.run(async () => {
      await this.api.updateWalletDefinition(definition.id, {
        isActive: !definition.isActive,
      });
    }, 'تغییر وضعیت ممکن نشد');
  }

  protected onBulkExpiryChange(date: JalaliDate | undefined): void {
    if (date) this.bulkExpiry.set(jalaliToIso(date));
  }

  /** تخصیص به همهٔ کارمندان فعال — سقف کمتر از مصرف‌شده رد می‌شود */
  protected async bulkAllocate(): Promise<void> {
    const definition = this.bulkFor();
    if (!definition) return;
    const cap = parseAmount(this.bulkCap());
    if (cap <= 0) {
      this.error.set('سقف اعتبار را وارد کنید');
      return;
    }
    await this.run(async () => {
      const result = await this.api.bulkAllocate({
        definitionId: definition.id,
        cap,
        expiresAt: this.bulkExpiry(),
      });
      this.bulkFor.set(null);
      this.bulkCap.set('');
      this.notice.set(
        `${fa(result.created)} تخصیص تازه، ${fa(result.updated)} به‌روزرسانی، ` +
          `${fa(result.skipped)} رد شده (سقف کمتر از مصرف).`,
      );
    }, 'تخصیص گروهی ممکن نشد');
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

function defaultExpiry(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 6);
  return isoDate(date);
}
