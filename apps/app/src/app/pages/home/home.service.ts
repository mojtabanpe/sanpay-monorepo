import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EmployeeStore, PaymentHistoryItem, Wallet } from '@sanpay/models';
import { forkJoin } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HomeService {
  private readonly http = inject(HttpClient);

  load() {
    return forkJoin({
      wallets: this.http.get<Wallet[]>('/api/wallets'),
      payments: this.http.get<PaymentHistoryItem[]>('/api/profile/payments', {
        params: new HttpParams().set('limit', 100),
      }),
    });
  }

  stores(allocationId: string) {
    return this.http.get<EmployeeStore[]>('/api/stores', {
      params: new HttpParams().set('allocationId', allocationId),
    });
  }
}
