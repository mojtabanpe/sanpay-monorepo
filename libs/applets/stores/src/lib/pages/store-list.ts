import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch, lucideX } from '@ng-icons/lucide';
import { EmployeeStore } from '@sanpay/models';
import { HlmBadgeImports } from '@sanpay/ui/badge';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmInputGroupImports } from '@sanpay/ui/input-group';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { HlmToggleGroupImports } from '@sanpay/ui/toggle-group';
import { firstValueFrom } from 'rxjs';
import { StoresService } from '../data-access/stores.service';
import { faNumber, toman } from '../format';

/** فیلتر کیف پول: '' یعنی همهٔ کیف‌پول‌ها */
type WalletFilter = string;

@Component({
  selector: 'stores-store-list',
  imports: [
    FormsModule,
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCardImports,
    HlmInputGroupImports,
    HlmSkeletonImports,
    HlmToggleGroupImports,
  ],
  viewProviders: [provideIcons({ lucideSearch, lucideX })],
  templateUrl: './store-list.html',
})
export class StoreListPage {
  private readonly storesService = inject(StoresService);
  private readonly router = inject(Router);

  protected readonly stores = signal<EmployeeStore[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly query = signal('');
  protected readonly walletFilter = signal<WalletFilter>('');

  /** کیف‌پول‌های متمایز روی همهٔ فروشگاه‌ها — منبع دکمه‌های فیلتر */
  protected readonly walletOptions = computed(() => {
    const names = new Set<string>();
    for (const store of this.stores()) {
      for (const wallet of store.wallets) names.add(wallet.name);
    }
    return [...names];
  });

  protected readonly visibleStores = computed(() => {
    const q = this.query().trim();
    const wallet = this.walletFilter();
    return this.stores().filter((store) => {
      if (wallet && !store.wallets.some((w) => w.name === wallet)) return false;
      if (!q) return true;
      return (
        store.name.includes(q) ||
        (store.category ?? '').includes(q) ||
        store.code.toUpperCase().includes(q.toUpperCase())
      );
    });
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.stores.set(await firstValueFrom(this.storesService.getStores()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleWallet(name: string): void {
    this.walletFilter.update((current) => (current === name ? '' : name));
  }

  /** از فهرست مستقیم به پرداخت: کد فروشگاه را به تب QR می‌دهیم */
  protected pay(store: EmployeeStore): void {
    void this.router.navigate(['/qr'], {
      queryParams: { store: store.code },
    });
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
}
