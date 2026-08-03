import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  EmployeeProfile,
  PaymentHistoryItem,
  ProfileSummary,
} from '@sanpay/models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  me(): Observable<EmployeeProfile> {
    return this.http.get<EmployeeProfile>('/api/auth/me');
  }

  summary(): Observable<ProfileSummary> {
    return this.http.get<ProfileSummary>('/api/profile/summary');
  }

  payments(limit = 30): Observable<PaymentHistoryItem[]> {
    return this.http.get<PaymentHistoryItem[]>('/api/profile/payments', {
      params: new HttpParams().set('limit', limit),
    });
  }

  /** رشتهٔ خالی یعنی حذف شماره */
  updatePhone(phone: string): Observable<EmployeeProfile> {
    return this.http.patch<EmployeeProfile>('/api/auth/me', { phone });
  }

  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }
}
