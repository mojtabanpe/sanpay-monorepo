import { TestBed } from '@angular/core/testing';
import {
  AdminApiService,
  StoreSettlementPreview,
} from '../../core/admin-api.service';
import { AdminAuthService } from '../../core/admin-auth.service';
import { Settlements } from './settlements';

const preview: StoreSettlementPreview = {
  storeId: 'store-a',
  storeName: 'فروشگاه آزمایشی',
  beneficiaryName: 'صاحب حساب',
  destinationIban: 'IR062960000000100324200001',
  paymentCount: 2,
  totalAmount: 12345,
  previewToken: 'signed-approval',
  expiresAt: '2099-01-01T00:00:00Z',
  mode: 'mock',
  apiUrl: '',
};

describe('manual store settlement approval', () => {
  async function setup(write = true) {
    const api = {
      settlements: vi.fn().mockResolvedValue([
        {
          id: 'batch-a',
          runKey: 'test-batch',
          status: 'PROCESSING',
          totalAmount: 12345,
          itemCount: 1,
          createdAt: '2026-10-28',
          items: [],
          error: null,
        },
      ]),
      settlementStores: vi
        .fn()
        .mockResolvedValue([{ id: preview.storeId, name: preview.storeName }]),
      previewSettlement: vi.fn().mockResolvedValue(preview),
      runSettlements: vi.fn().mockResolvedValue({}),
      reconcileSettlement: vi.fn().mockResolvedValue({}),
    };
    await TestBed.configureTestingModule({
      imports: [Settlements],
      providers: [
        { provide: AdminApiService, useValue: api },
        { provide: AdminAuthService, useValue: { hasPermission: () => write } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Settlements);
    await fixture.whenStable();
    fixture.detectChanges();
    // Set selection directly; the browser test covers the select interaction.
    const component = fixture.componentInstance as unknown as {
      storeId: { set(value: string): void };
      showPreview(): Promise<void>;
      run(): Promise<void>;
      closeConfirmation(state: 'open' | 'closed'): void;
      confirmationOpen(): string;
    };
    component.storeId.set(preview.storeId);
    fixture.detectChanges();
    return { api, fixture, component };
  }

  it('previews before submission and cancellation never sends money', async () => {
    const { api, fixture, component } = await setup();
    await component.showPreview();
    fixture.detectChanges();
    await fixture.whenStable();
    const dialog = document.querySelector('hlm-dialog-content');
    expect(dialog?.textContent).toContain(preview.destinationIban);
    expect(dialog?.textContent).toContain(preview.beneficiaryName);
    expect(dialog?.textContent).toContain('شبیه‌سازی');
    expect(api.runSettlements).not.toHaveBeenCalled();
    component.closeConfirmation('closed');
    expect(component.confirmationOpen()).toBe('closed');
    expect(api.runSettlements).not.toHaveBeenCalled();
  });

  it('sends the approved store and token once even with repeated clicks', async () => {
    const { api, fixture, component } = await setup();
    await component.showPreview();
    let finish!: () => void;
    api.runSettlements.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({});
        }),
    );
    const pending = component.run();
    await component.run();
    expect(api.runSettlements).toHaveBeenCalledExactlyOnceWith(
      preview.storeId,
      preview.previewToken,
    );
    finish();
    await pending;
    fixture.detectChanges();
    expect(component.confirmationOpen()).toBe('closed');
  });

  it('inquires about the selected batch without calling submission', async () => {
    const { api, fixture } = await setup();
    const inquiry = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ].find((b) => b.textContent?.includes('استعلام وضعیت'));
    if (!inquiry) throw new Error('Inquiry button missing');
    inquiry.click();
    await fixture.whenStable();
    expect(api.reconcileSettlement).toHaveBeenCalledExactlyOnceWith('batch-a');
    expect(api.runSettlements).not.toHaveBeenCalled();
  });

  it('retains the approval and shows errors after a failed request', async () => {
    const { api, fixture, component } = await setup();
    await component.showPreview();
    api.runSettlements.mockRejectedValue({
      error: { message: 'خطای آزمایشی' },
    });
    await component.run();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.confirmationOpen()).toBe('open');
    expect(document.querySelector('hlm-dialog-content')?.textContent).toContain(
      'خطای آزمایشی',
    );
  });

  it('read-only admins cannot preview, submit or see write controls', async () => {
    const { api, fixture, component } = await setup(false);
    await component.showPreview();
    await component.run();
    expect(api.previewSettlement).not.toHaveBeenCalled();
    expect(api.runSettlements).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'پیش‌نمایش تسویه',
    );
    expect(api.settlementStores).not.toHaveBeenCalled();
  });
});
