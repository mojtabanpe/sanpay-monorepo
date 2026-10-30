import { TestBed } from '@angular/core/testing';
import {
  AdminApiService,
  SettlementItemRow,
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

function row(overrides: Partial<SettlementItemRow>): SettlementItemRow {
  return {
    id: 'item',
    beneficiaryName: 'فروشگاه آزمایشی',
    beneficiaryType: 'STORE',
    amount: 12345,
    status: 'PROCESSING',
    followUpCode: null,
    error: null,
    createdAt: '2026-10-28T08:00:00Z',
    settledAt: null,
    retryOfId: null,
    retried: false,
    batch: {
      id: 'batch-a',
      runKey: 'test-batch',
      status: 'PROCESSING',
      error: null,
    },
    ...overrides,
  };
}

function buttons(fixture: { nativeElement: unknown }, text: string) {
  return [
    ...(fixture.nativeElement as HTMLElement).querySelectorAll('button'),
  ].filter((b) => b.textContent?.trim() === text);
}

describe('manual store settlement approval', () => {
  // jsdom has no ResizeObserver; the date-picker width directive needs one.
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  async function setup(write = true) {
    const api = {
      settlementItems: vi.fn().mockResolvedValue({
        items: [
          row({ id: 'item-a', status: 'PROCESSING' }),
          row({ id: 'item-failed', status: 'FAILED' }),
          row({ id: 'item-retried', status: 'FAILED', retried: true }),
        ],
        total: 3,
        sumAmount: 37035,
      }),
      retrySettlementItem: vi.fn().mockResolvedValue({}),
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
    // فقط سطر در حال پردازش استعلام دارد؛ سطرهای ناموفق نهایی ندارند
    const inquiry = buttons(fixture, 'استعلام وضعیت');
    expect(inquiry).toHaveLength(1);
    inquiry[0].click();
    await fixture.whenStable();
    expect(api.reconcileSettlement).toHaveBeenCalledExactlyOnceWith('batch-a');
    expect(api.runSettlements).not.toHaveBeenCalled();
  });

  it('lists transfers as one table with the server-side total', async () => {
    const { api, fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    ).toHaveLength(3);
    expect(text).toContain('test-batch');
    expect(text).toContain('تلاش مجدد ثبت شده');
    expect(api.settlementItems).toHaveBeenCalledWith({
      q: undefined,
      status: undefined,
      beneficiaryType: undefined,
      from: undefined,
      to: undefined,
      page: 1,
      pageSize: 30,
    });
  });

  it('offers retry only for a failed transfer that has not been retried', async () => {
    const { api, fixture } = await setup();
    const retry = buttons(fixture, 'تلاش مجدد');
    expect(retry).toHaveLength(1);
    retry[0].click();
    await fixture.whenStable();
    expect(api.retrySettlementItem).toHaveBeenCalledExactlyOnceWith(
      'item-failed',
    );
  });

  it('filters go to the server and reset to the first page', async () => {
    const { api, fixture } = await setup();
    const component = fixture.componentInstance as unknown as {
      page: { set(value: number): void };
      query: { set(value: string): void };
      onStatusChange(value: unknown): void;
      onTypeChange(value: unknown): void;
      clearFilters(): void;
    };
    component.page.set(3);
    component.query.set('  IR123  ');
    component.onTypeChange('HOTELYAR');
    component.onStatusChange('FAILED');
    await fixture.whenStable();
    expect(api.settlementItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: 'IR123',
        status: 'FAILED',
        beneficiaryType: 'HOTELYAR',
        page: 1,
      }),
    );
    component.clearFilters();
    await fixture.whenStable();
    expect(api.settlementItems).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: undefined,
        status: undefined,
        beneficiaryType: undefined,
      }),
    );
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
    expect(buttons(fixture, 'تلاش مجدد')).toHaveLength(0);
    expect(buttons(fixture, 'استعلام وضعیت')).toHaveLength(0);
    expect(api.settlementStores).not.toHaveBeenCalled();
  });
});
