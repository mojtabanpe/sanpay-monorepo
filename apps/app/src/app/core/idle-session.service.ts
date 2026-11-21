import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, LAST_ACTIVITY_KEY } from '@sanpay/applets/auth';
import {
  SESSION_ACTIVITY_HEARTBEAT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from '@sanpay/models';

/** Timers may be suspended in Android's background; always check wall-clock time. */
@Injectable({ providedIn: 'root' })
export class IdleSessionService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private lastHeartbeat = 0;
  private readonly activityEvents = [
    'pointerdown',
    'touchstart',
    'keydown',
    'wheel',
  ];

  private readonly onActivity = () => {
    if (!this.running || document.hidden || !this.checkDeadline()) return;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    this.schedule();
    this.heartbeat();
  };

  private readonly onResume = () => {
    if (this.running && !document.hidden && this.checkDeadline())
      this.schedule();
  };

  private readonly onStorage = (event: StorageEvent) => {
    if (
      event.key === 'sanpay_token' &&
      !event.newValue &&
      !this.auth.token &&
      this.running
    ) {
      this.auth.clearSession();
      this.stop();
      void this.router.navigate(['/login']);
    } else if (event.key === LAST_ACTIVITY_KEY && this.running) {
      if (this.checkDeadline()) this.schedule();
    }
  };

  constructor() {
    this.activityEvents.forEach((event) =>
      window.addEventListener(event, this.onActivity, { passive: true }),
    );
    document.addEventListener('visibilitychange', this.onResume);
    window.addEventListener('pageshow', this.onResume);
    window.addEventListener('focus', this.onResume);
    window.addEventListener('storage', this.onStorage);
    this.destroyRef.onDestroy(() => {
      this.stop();
      this.activityEvents.forEach((event) =>
        window.removeEventListener(event, this.onActivity),
      );
      document.removeEventListener('visibilitychange', this.onResume);
      window.removeEventListener('pageshow', this.onResume);
      window.removeEventListener('focus', this.onResume);
      window.removeEventListener('storage', this.onStorage);
    });

    // Check stored sessions synchronously before the first route is shown.
    if (this.auth.isLoggedIn()) this.start();
    effect(() => {
      if (this.auth.isLoggedIn()) this.start();
      else this.stop();
    });
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastHeartbeat = 0;
    if (!this.readLastActivity()) {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }
    if (!this.checkDeadline()) return;
    this.schedule();
    if (!document.hidden) this.heartbeat();
  }

  private stop(): void {
    this.running = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private readLastActivity(): number {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private deadline(): number {
    const idleDeadline = this.readLastActivity() + SESSION_IDLE_TIMEOUT_MS;
    const tokenExpiry = jwtExpiry(this.auth.token);
    return tokenExpiry ? Math.min(idleDeadline, tokenExpiry) : idleDeadline;
  }

  private checkDeadline(): boolean {
    if (!this.auth.token) {
      this.auth.clearSession();
      this.stop();
      void this.router.navigate(['/login']);
      return false;
    }
    if (Date.now() < this.deadline()) return true;

    // Begin remote revocation with the old token, but lock locally immediately.
    void this.auth.logout();
    this.auth.clearSession();
    this.stop();
    void this.router.navigate(['/login']);
    return false;
  }

  private schedule(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        if (this.running && this.checkDeadline()) this.schedule();
      },
      Math.max(0, this.deadline() - Date.now()),
    );
  }

  private heartbeat(): void {
    const now = Date.now();
    if (now - this.lastHeartbeat < SESSION_ACTIVITY_HEARTBEAT_MS) return;
    this.lastHeartbeat = now;
    // Only user activity, not a background interval, extends the server session.
    this.http.get('/api/auth/me').subscribe({ error: () => undefined });
  }
}

function jwtExpiry(token: string | null): number | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}
