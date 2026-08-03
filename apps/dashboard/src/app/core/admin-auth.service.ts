import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AdminProfile } from '@sanpay/models';
import { firstValueFrom } from 'rxjs';

const TOKEN_KEY = 'sanpay_admin_token';
const PROFILE_KEY = 'sanpay_admin_profile';

interface LoginResponse {
  accessToken: string;
  admin: AdminProfile;
}

@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);

  private readonly _profile = signal<AdminProfile | null>(readStoredProfile());

  readonly profile = this._profile.asReadonly();
  readonly isLoggedIn = computed(() => this._profile() !== null && !!this.token);
  /** VIEWER فقط می‌خواند — دکمه‌های تغییر برایش نمایش داده نمی‌شود */
  readonly canWrite = computed(() => this._profile()?.role !== 'VIEWER');
  readonly isSuperAdmin = computed(() => this._profile()?.role === 'SUPER_ADMIN');

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async login(username: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/admin/auth/login', {
        username,
        password,
      }),
    );
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(response.admin));
    this._profile.set(response.admin);
  }

  async refresh(): Promise<AdminProfile> {
    const profile = await firstValueFrom(
      this.http.get<AdminProfile>('/api/admin/auth/me'),
    );
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    this._profile.set(profile);
    return profile;
  }

  changePassword(currentPassword: string, newPassword: string) {
    return firstValueFrom(
      this.http.post<{ ok: boolean }>('/api/admin/auth/change-password', {
        currentPassword,
        newPassword,
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    this._profile.set(null);
  }
}

function readStoredProfile(): AdminProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminProfile;
  } catch {
    return null;
  }
}
