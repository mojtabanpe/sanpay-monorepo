import { TestBed } from '@angular/core/testing';
import { AdminProfile } from '@sanpay/models';
import { AdminApiService } from '../../core/admin-api.service';
import { AdminsPage } from './admins';

const admin: AdminProfile = {
  id: 'password-test',
  username: 'password-test',
  name: 'مدیر تست',
  role: 'ADMIN',
  permissions: ['employees:read'],
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-10-28T00:00:00Z',
};

describe('dashboard admin password reset', () => {
  async function setup() {
    const api = {
      admins: vi.fn().mockResolvedValue([admin]),
      resetAdminPassword: vi.fn().mockResolvedValue({ ok: true }),
    };
    await TestBed.configureTestingModule({
      imports: [AdminsPage],
      providers: [{ provide: AdminApiService, useValue: api }],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector(
      'input[placeholder="رمز تازه"]',
    ) as HTMLInputElement;
    const button = [...host.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === 'ذخیره رمز',
    );
    if (!button) throw new Error('Password save button is missing');
    return { api, fixture, input, button, host };
  }

  it('saves the exact entered password using the visible save button and clears it only on success', async () => {
    const { api, fixture, input, button, host } = await setup();
    input.value = ' exact-password ';
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.resetAdminPassword).toHaveBeenCalledWith(
      admin.id,
      ' exact-password ',
    );
    expect(input.value).toBe('');
    expect(host.textContent).toContain('رمز جدید ذخیره شد');
  });

  it('retains the draft on request failure so it can be retried', async () => {
    const { api, fixture, input, button, host } = await setup();
    api.resetAdminPassword.mockRejectedValue({});
    input.value = 'retry-password';
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(input.value).toBe('retry-password');
    expect(host.textContent).toContain('ذخیرهٔ رمز ممکن نشد');
  });

  it('rejects short passwords without sending a request', async () => {
    const { api, fixture, input, button, host } = await setup();
    input.value = 'short';
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.resetAdminPassword).not.toHaveBeenCalled();
    expect(host.textContent).toContain('حداقل ۸ نویسه');
  });
});
