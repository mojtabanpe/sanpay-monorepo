import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  EmployeeAuthResponse,
  EmployeeProfile,
  OtpRequestResult,
} from '@sanpay/models';
import { firstValueFrom } from 'rxjs';

const TOKEN_KEY = 'sanpay_token';
const PROFILE_KEY = 'sanpay_profile';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private pendingProfile: EmployeeProfile | null = null;

  private readonly _profile = signal<EmployeeProfile | null>(
    readStoredProfile(),
  );

  readonly profile = this._profile.asReadonly();
  readonly isLoggedIn = computed(
    () => this._profile() !== null && !!this.token,
  );

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async login(nationalCode: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<EmployeeAuthResponse>('/api/auth/login', {
        nationalCode,
        password,
      }),
    );
    this.storeSession(response);
  }

  requestOtp(nationalCode: string, phone: string): Promise<OtpRequestResult> {
    return firstValueFrom(
      this.http.post<OtpRequestResult>('/api/auth/otp/request', {
        nationalCode,
        phone,
      }),
    );
  }

  async verifyOtp(
    nationalCode: string,
    phone: string,
    code: string,
  ): Promise<EmployeeAuthResponse> {
    const response = await firstValueFrom(
      this.http.post<EmployeeAuthResponse>('/api/auth/otp/verify', {
        nationalCode,
        phone,
        code,
      }),
    );
    if (response.requiresPasswordSetup) {
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.removeItem(PROFILE_KEY);
      this._profile.set(null);
      this.pendingProfile = response.employee;
    } else {
      this.storeSession(response);
    }
    return response;
  }

  async setInitialPassword(password: string): Promise<{ ok: boolean }> {
    const result = await firstValueFrom(
      this.http.post<{ ok: boolean }>('/api/auth/set-initial-password', {
        password,
      }),
    );
    if (this.pendingProfile) this.setProfile(this.pendingProfile);
    this.pendingProfile = null;
    return result;
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
    this.pendingProfile = null;
  }

  private storeSession(response: EmployeeAuthResponse): void {
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(response.employee));
    this._profile.set(response.employee);
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
