import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Wallet } from '@sanpay/models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly http = inject(HttpClient);

  getWallets(): Observable<Wallet[]> {
    return this.http.get<Wallet[]>('/api/wallets');
  }
}
