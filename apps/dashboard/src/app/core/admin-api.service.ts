import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  AdminBookingRow,
  AdminCompanyRow,
  AdminEmployeeDetail,
  AdminEmployeeRow,
  AdminOverview,
  AdminPaymentRow,
  AdminProfile,
  AdminStoreRow,
  AdminWalletDefinitionRow,
  BulkAllocateInput,
  BulkAllocateResult,
  ImportEmployeesInput,
  ImportEmployeesResult,
  CreateEmployeeInput,
  CreateCompanyInput,
  CreateStoreInput,
  CreateWalletDefinitionInput,
  Paginated,
  UpdateEmployeeInput,
  UpdateCompanyInput,
  UpdateStoreInput,
  UpdateWalletDefinitionInput,
} from '@sanpay/models';
import { firstValueFrom } from 'rxjs';

/** پارامترهای فهرست — کلیدهای خالی حذف می‌شوند */
export type Query = Record<string, string | number | undefined | null>;

export interface SettlementItemView {
  id: string;
  beneficiaryName: string;
  beneficiaryType: 'STORE' | 'HOTELYAR' | 'EGHAMAT24';
  amount: number;
  status: string;
  followUpCode: string | null;
  error: string | null;
  settledAt: string | null;
  retryOfId: string | null;
}

export interface SettlementBatchView {
  id: string;
  runKey: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  createdAt: string;
  items: SettlementItemView[];
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);

  // ─── نمای کلی ─────────────────────────────────────────────────────────
  overview() {
    return this.get<AdminOverview>('/api/admin/overview');
  }

  // ─── شرکت‌ها ──────────────────────────────────────────────────────────────
  companies(query: Query = {}) {
    return this.get<Paginated<AdminCompanyRow>>('/api/admin/companies', query);
  }

  createCompany(input: CreateCompanyInput) {
    return this.post<AdminCompanyRow>('/api/admin/companies', input);
  }

  updateCompany(id: string, input: UpdateCompanyInput) {
    return this.patch<AdminCompanyRow>(`/api/admin/companies/${id}`, input);
  }

  // ─── کارمندان ─────────────────────────────────────────────────────────
  employees(query: Query = {}) {
    return this.get<Paginated<AdminEmployeeRow>>('/api/admin/employees', query);
  }

  employee(id: string) {
    return this.get<AdminEmployeeDetail>(`/api/admin/employees/${id}`);
  }

  createEmployee(input: CreateEmployeeInput) {
    return this.post<AdminEmployeeRow>('/api/admin/employees', input);
  }

  importEmployees(input: ImportEmployeesInput) {
    return this.post<ImportEmployeesResult>(
      '/api/admin/employees/import',
      input,
    );
  }

  updateEmployee(id: string, input: UpdateEmployeeInput) {
    return this.patch<AdminEmployeeRow>(`/api/admin/employees/${id}`, input);
  }

  resetEmployeePassword(id: string, password: string) {
    return this.post<{ ok: boolean }>(
      `/api/admin/employees/${id}/reset-password`,
      { password },
    );
  }

  // ─── تخصیص کیف پول ────────────────────────────────────────────────────
  addAllocation(
    employeeId: string,
    input: { definitionId: string; cap: number; expiresAt: string },
  ) {
    return this.post(`/api/admin/employees/${employeeId}/allocations`, input);
  }

  updateAllocation(
    id: string,
    input: { cap?: number; expiresAt?: string; isActive?: boolean },
  ) {
    return this.patch(`/api/admin/allocations/${id}`, input);
  }

  adjustAllocation(id: string, amount: number, note: string) {
    return this.post(`/api/admin/allocations/${id}/adjust`, { amount, note });
  }

  // ─── فروشگاه‌ها ───────────────────────────────────────────────────────
  stores(query: Query = {}) {
    return this.get<Paginated<AdminStoreRow>>('/api/admin/stores', query);
  }

  createStore(input: CreateStoreInput) {
    return this.post<AdminStoreRow>('/api/admin/stores', input);
  }

  updateStore(id: string, input: UpdateStoreInput) {
    return this.patch<AdminStoreRow>(`/api/admin/stores/${id}`, input);
  }

  resetStorePassword(id: string, password: string) {
    return this.post<{ ok: boolean }>(
      `/api/admin/stores/${id}/reset-password`,
      {
        password,
      },
    );
  }

  // ─── کیف‌پول‌ها ───────────────────────────────────────────────────────
  walletDefinitions(query: Query = {}) {
    return this.get<Paginated<AdminWalletDefinitionRow>>(
      '/api/admin/wallet-definitions',
      query,
    );
  }

  createWalletDefinition(input: CreateWalletDefinitionInput) {
    return this.post<AdminWalletDefinitionRow>(
      '/api/admin/wallet-definitions',
      input,
    );
  }

  updateWalletDefinition(id: string, input: UpdateWalletDefinitionInput) {
    return this.patch<AdminWalletDefinitionRow>(
      `/api/admin/wallet-definitions/${id}`,
      input,
    );
  }

  bulkAllocate(input: BulkAllocateInput) {
    return this.post<BulkAllocateResult>(
      '/api/admin/wallet-definitions/bulk-allocate',
      input,
    );
  }

  // ─── گزارش‌ها ─────────────────────────────────────────────────────────
  payments(query: Query = {}) {
    return this.get<Paginated<AdminPaymentRow>>('/api/admin/payments', query);
  }

  async downloadPaymentsExcel(query: Query = {}): Promise<void> {
    const params = this.params(query);
    const blob = await firstValueFrom(
      this.http.get('/api/admin/payments.xlsx', {
        params,
        responseType: 'blob',
      }),
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sanpay-payments-${new Date().toISOString().slice(0, 10)}.xlsx`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  bookings(query: Query = {}) {
    return this.get<Paginated<AdminBookingRow>>('/api/admin/bookings', query);
  }

  settlements() {
    return this.get<SettlementBatchView[]>('/api/admin/settlements');
  }

  runSettlements() {
    return this.post<SettlementBatchView>('/api/admin/settlements/run', {});
  }

  retrySettlementItem(id: string) {
    return this.post<SettlementBatchView>(
      `/api/admin/settlements/items/${id}/retry`,
      {},
    );
  }

  // ─── کاربران داشبورد ──────────────────────────────────────────────────
  admins() {
    return this.get<AdminProfile[]>('/api/admin/admins');
  }

  createAdmin(input: {
    username: string;
    name: string;
    password: string;
    role?: string;
  }) {
    return this.post<AdminProfile>('/api/admin/admins', input);
  }

  updateAdmin(
    id: string,
    input: { name?: string; role?: string; isActive?: boolean },
  ) {
    return this.patch<AdminProfile>(`/api/admin/admins/${id}`, input);
  }

  resetAdminPassword(id: string, password: string) {
    return this.post<{ ok: boolean }>(
      `/api/admin/admins/${id}/reset-password`,
      {
        password,
      },
    );
  }

  // ─── پایه ─────────────────────────────────────────────────────────────
  private get<T>(url: string, query: Query = {}) {
    return firstValueFrom(
      this.http.get<T>(url, { params: this.params(query) }),
    );
  }

  private params(query: Query): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params = params.set(key, String(value));
    }
    return params;
  }

  private post<T>(url: string, body: unknown) {
    return firstValueFrom(this.http.post<T>(url, body));
  }

  private patch<T>(url: string, body: unknown) {
    return firstValueFrom(this.http.patch<T>(url, body));
  }
}

/** پیام خطای قابل‌نمایش از پاسخ خطای Nest */
export function apiError(caught: unknown, fallback: string): string {
  const message = (caught as { error?: { message?: unknown } })?.error?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message) && typeof message[0] === 'string')
    return message[0];
  return fallback;
}
