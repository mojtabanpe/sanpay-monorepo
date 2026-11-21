import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  AuthService,
  LAST_ACTIVITY_KEY,
  authInterceptor,
} from '@sanpay/applets/auth';
import { EmployeeProfile, SESSION_IDLE_TIMEOUT_MS } from '@sanpay/models';
import { IdleSessionService } from './core/idle-session.service';

const employee: EmployeeProfile = {
  id: 'employee-1',
  nationalCode: '0012345678',
  personnelCode: 'P1',
  firstName: 'علی',
  lastName: 'رضایی',
  phone: '09123456789',
  company: { id: 'company-1', name: 'شرکت' },
  organizationalRank: 'EMPLOYEE',
};

describe('employee idle session', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T12:00:00Z'));
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    localStorage.clear();
    localStorage.setItem('sanpay_token', 'current-token');
    localStorage.setItem('sanpay_profile', JSON.stringify(employee));
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    navigate.mockClear();
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(IdleSessionService);
    http.expectOne('/api/auth/me').flush(employee);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('locks immediately after 15 minutes even if server logout is slow', () => {
    vi.advanceTimersByTime(SESSION_IDLE_TIMEOUT_MS);
    const logout = http.expectOne('/api/auth/logout');
    expect(logout.request.headers.get('Authorization')).toBe(
      'Bearer current-token',
    );
    expect(auth.token).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
    logout.flush({ ok: true });
  });

  it('extends the deadline only for real interaction', () => {
    vi.advanceTimersByTime(10 * 60_000);
    window.dispatchEvent(new Event('pointerdown'));
    http.expectOne('/api/auth/me').flush(employee);
    vi.advanceTimersByTime(SESSION_IDLE_TIMEOUT_MS - 1);
    expect(auth.token).toBe('current-token');
    vi.advanceTimersByTime(1);
    http.expectOne('/api/auth/logout').flush({ ok: true });
    expect(auth.token).toBeNull();
  });

  it('checks elapsed time on resume when Android suspended the timer', () => {
    vi.setSystemTime(Date.now() + SESSION_IDLE_TIMEOUT_MS + 1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(auth.token).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    http.expectOne('/api/auth/logout').flush({ ok: true });
  });

  it('does not let the first interaction revive an already expired session', () => {
    vi.setSystemTime(Date.now() + SESSION_IDLE_TIMEOUT_MS + 1);
    window.dispatchEvent(new Event('touchstart'));
    expect(auth.token).toBeNull();
    http.expectOne('/api/auth/logout').flush({ ok: true });
  });

  it('also locks when the JWT expires during active use', () => {
    const expiry = Math.floor((Date.now() + 5 * 60_000) / 1000);
    localStorage.setItem(
      'sanpay_token',
      `x.${btoa(JSON.stringify({ exp: expiry }))}.x`,
    );
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(5 * 60_000);
    expect(auth.token).toBeNull();
    http.expectOne('/api/auth/logout').flush({ ok: true });
  });

  it('ignores an old cross-tab logout event if a new session already exists', () => {
    localStorage.setItem('sanpay_token', 'new-token');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'sanpay_token', newValue: null }),
    );
    expect(auth.token).toBe('new-token');
    expect(navigate).not.toHaveBeenCalled();
  });
});
