import { Component, computed, inject, signal } from '@angular/core';
import { PaymentHistoryItem } from '@sanpay/models';
import { HlmButtonImports } from '@sanpay/ui/button';
import { HlmCardImports } from '@sanpay/ui/card';
import { HlmSkeletonImports } from '@sanpay/ui/skeleton';
import { firstValueFrom } from 'rxjs';
import { ProfileService } from '../data-access/profile.service';
import { faNumber, jalaliTime, toman } from '../format';

@Component({
  selector: 'profile-payment-history',
  imports: [HlmButtonImports, HlmCardImports, HlmSkeletonImports],
  templateUrl: './payment-history.html',
})
export class PaymentHistoryPage {
  private readonly profileService = inject(ProfileService);

  protected readonly payments = signal<PaymentHistoryItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly total = computed(() =>
    this.payments().reduce((sum, payment) => sum + payment.amount, 0),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(false);
    try {
      this.payments.set(await firstValueFrom(this.profileService.payments()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly toman = toman;
  protected readonly count = faNumber;
  protected readonly when = jalaliTime;
}
