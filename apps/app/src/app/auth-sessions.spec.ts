import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService, authInterceptor } from '@sanpay/applets/auth';
import { EmployeeProfile } from '@sanpay/models';

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

describe('employee session authentication', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const navigate = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('sanpay_token', 'current-token');
    localStorage.setItem('sanpay_profile', JSON.stringify(employee));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    navigate.mockClear();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('revokes the server session before clearing local credentials', async () => {
    const result = auth.logout();
    const request = http.expectOne('/api/auth/logout');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe(
      'Bearer current-token',
    );
    expect(auth.isLoggedIn()).toBe(true);
    request.flush({ ok: true });
    expect(await result).toBe(true);
    expect(auth.token).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('keeps the session available to retry if remote logout fails', async () => {
    const result = auth.logout();
    http
      .expectOne('/api/auth/logout')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(await result).toBe(false);
    expect(auth.token).toBe('current-token');
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('clears a remotely revoked session on 401 without requesting logout again', async () => {
    const request = firstValueFrom(
      TestBed.inject(HttpClient).get('/api/wallets'),
    );
    const rejected = expect(request).rejects.toMatchObject({ status: 401 });
    http
      .expectOne('/api/wallets')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(auth.token).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
    http.expectNone('/api/auth/logout');
  });

  it('replaces the restricted OTP token after initial password setup', async () => {
    const verified = auth.verifyOtp(
      employee.nationalCode,
      employee.phone!,
      '123456',
    );
    http.expectOne('/api/auth/otp/verify').flush({
      employee,
      accessToken: 'restricted-token',
      requiresPasswordSetup: true,
    });
    await verified;
    expect(auth.isLoggedIn()).toBe(false);
    const completed = auth.setInitialPassword('Password123!');
    http
      .expectOne('/api/auth/set-initial-password')
      .flush({ ok: true, accessToken: 'full-access-token' });
    await completed;
    expect(auth.token).toBe('full-access-token');
    expect(auth.isLoggedIn()).toBe(true);
  });
});
