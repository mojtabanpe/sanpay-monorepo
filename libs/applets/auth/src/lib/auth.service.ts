import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { EmployeeProfile } from '@sanpay/models';
import { firstValueFrom } from 'rxjs';

const TOKEN_KEY = 'sanpay_token';
const PROFILE_KEY = 'sanpay_profile';

interface LoginResponse {
  accessToken: string;
  employee: EmployeeProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _profile = signal<EmployeeProfile | null>(readStoredProfile());

  readonly profile = this._profile.asReadonly();
  readonly isLoggedIn = computed(() => this._profile() !== null && !!this.token);

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async login(nationalCode: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', { nationalCode, password }),
    );
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(response.employee));
    this._profile.set(response.employee);
  }

  /** پروفایل تازه از سرور — بعد از ویرایش اطلاعات تماس هم صدا زده می‌شود */
  async refreshProfile(): Promise<EmployeeProfile> {
    const profile = await firstValueFrom(
      this.http.get<EmployeeProfile>('/api/auth/me'),
    );
    this.setProfile(profile);
    return profile;
  }

  /** پروفایل ذخیره‌شده را جایگزین می‌کند (مثلاً بعد از تغییر شمارهٔ موبایل) */
  setProfile(profile: EmployeeProfile): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    this._profile.set(profile);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    this._profile.set(null);
  }
}

function readStoredProfile(): EmployeeProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EmployeeProfile;
  } catch {
    return null;
  }
}
