import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CardRefundInput,
  CardRefundSummary,
  EmployeeProfile,
  EmployeeSessionView,
  PaymentHistoryItem,
  Receipt,
  ProfileSummary,
  WalletTransactionPage,
} from '@sanpay/models';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  me(): Observable<EmployeeProfile> {
    return this.http.get<EmployeeProfile>('/api/auth/me');
  }

  sessions(): Observable<EmployeeSessionView[]> {
    return this.http.get<EmployeeSessionView[]>('/api/auth/sessions');
  }

  revokeSession(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `/api/auth/sessions/${encodeURIComponent(id)}`,
    );
  }

  revokeOtherSessions(): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>('/api/auth/sessions/others');
  }

  summary(): Observable<ProfileSummary> {
    return this.http.get<ProfileSummary>('/api/profile/summary');
  }

  payments(limit = 30): Observable<PaymentHistoryItem[]> {
    return this.http.get<PaymentHistoryItem[]>('/api/profile/payments', {
      params: new HttpParams().set('limit', limit),
    });
  }

  /** نمایش دوبارهٔ رسید یک خرید فروشگاهی */
  paymentReceipt(paymentId: string): Observable<Receipt> {
    return this.http.get<Receipt>(`/api/profile/payments/${paymentId}/receipt`);
  }

  walletTransactions(cursor?: string): Observable<WalletTransactionPage> {
    return this.http.get<WalletTransactionPage>(
      '/api/profile/wallet-transactions',
      {
        params: cursor
          ? new HttpParams().set('cursor', cursor)
          : new HttpParams(),
      },
    );
  }

  /** ماندهٔ پرداخت‌های کارتی قبلی و آخرین درخواست‌های بازگشت به کارت */
  cardRefunds(): Observable<CardRefundSummary> {
    return this.http.get<CardRefundSummary>('/api/upg/card-refunds');
  }

  /** @param amount تومان */
  requestCardRefund(amount: number): Observable<CardRefundSummary> {
    const body: CardRefundInput = { amount };
    return this.http.post<CardRefundSummary>('/api/upg/card-refunds', body);
  }

  /** عکس پروفایل — سرور به WebP مربعی تبدیلش می‌کند و EXIF را دور می‌ریزد */
  uploadAvatar(file: File): Observable<{ avatarUrl: string | null }> {
    const body = new FormData();
    body.append('file', file);
    return this.http.post<{ avatarUrl: string | null }>(
      '/api/profile/avatar',
      body,
    );
  }

  removeAvatar(): Observable<{ avatarUrl: null }> {
    return this.http.delete<{ avatarUrl: null }>('/api/profile/avatar');
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
