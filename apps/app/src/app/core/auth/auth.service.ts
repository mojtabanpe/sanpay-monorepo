import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'sanpay_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly isLoggedIn = signal<boolean>(
    !!localStorage.getItem(STORAGE_KEY)
  );

  login(personnelCode: string, _password: string): void {
    localStorage.setItem(STORAGE_KEY, personnelCode);
    this.isLoggedIn.set(true);
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.isLoggedIn.set(false);
  }

  get personnelCode(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  }
}
