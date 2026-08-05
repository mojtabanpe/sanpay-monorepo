import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { StoreProfile } from '@sanpay/models';
import { firstValueFrom } from 'rxjs';

const TOKEN_KEY = 'sanpay_store_token';
const PROFILE_KEY = 'sanpay_store_profile';

/** از @sanpay/models می‌آید تا تعریفش با آنچه API می‌فرستد یکی بماند */
export type { StoreProfile };

interface LoginResponse {
  accessToken: string;
  store: StoreProfile;
}

@Injectable({ providedIn: 'root' })
export class StoreAuthService {
  private readonly http = inject(HttpClient);

  private readonly _profile = signal<StoreProfile | null>(readStoredProfile());

  readonly profile = this._profile.asReadonly();
  readonly isLoggedIn = computed(() => this._profile() !== null && !!this.token);

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async login(username: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/store/auth/login', {
        username,
        password,
      }),
    );
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(response.store));
    this._profile.set(response.store);
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    this._profile.set(null);
  }
}

function readStoredProfile(): StoreProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoreProfile;
  } catch {
    return null;
  }
}
