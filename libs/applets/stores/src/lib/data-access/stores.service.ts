import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EmployeeStore } from '@sanpay/models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StoresService {
  private readonly http = inject(HttpClient);

  /** فروشگاه‌هایی که با کیف‌پول‌های کارمند قابل استفاده‌اند */
  getStores(): Observable<EmployeeStore[]> {
    return this.http.get<EmployeeStore[]>('/api/stores');
  }
}
