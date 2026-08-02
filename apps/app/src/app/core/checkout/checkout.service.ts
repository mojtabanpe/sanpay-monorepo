import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { CreatePaymentInput, Receipt, StoreCheckout } from '@sanpay/models';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private readonly http = inject(HttpClient);

  /** فروشگاه + کیف‌پول‌های قابل استفاده و سقف هرکدام */
  getCheckout(storeCode: string): Promise<StoreCheckout> {
    return firstValueFrom(
      this.http.get<StoreCheckout>(`/api/checkout/${encodeURIComponent(storeCode)}`),
    );
  }

  pay(input: CreatePaymentInput): Promise<Receipt> {
    return firstValueFrom(this.http.post<Receipt>('/api/payments', input));
  }
}

/**
 * محتوای QR صندوق `SANPAY:S:<CODE>` است. کد خام (بدون پیشوند) هم پذیرفته
 * می‌شود تا کارمند بتواند وقتی دوربین کار نمی‌کند همان کد را دستی تایپ کند.
 */
export function parseStoreCode(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  const match = /^(?:SANPAY:S:)?([A-Z0-9]{4,16})$/.exec(value);
  return match ? match[1] : null;
}
