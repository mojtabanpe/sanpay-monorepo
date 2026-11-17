import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { UpgService } from '@sanpay/applets/upg';
import { UpgIntentView } from '@sanpay/models';
import { of } from 'rxjs';
import { UpgPayPage } from '../../../../libs/applets/upg/src/lib/pages/upg-pay';

describe('flight payment from credit', () => {
  const source = {
    allocationId: 'tourism-wallet',
    name: 'گردشگری',
    icon: 'travel',
    max: 10_000_000,
    kind: 'WELFARE' as const,
  };
  const intent: UpgIntentView = {
    id: 'flight-payment',
    purpose: 'FLIGHT',
    status: 'PENDING',
    title: 'بلیت پرواز',
    subtitle: null,
    amount: 2_000_000,
    gatewayAmount: 0,
    failureReason: null,
    expiresAt: '2099-01-01T00:00:00Z',
    sources: [source],
    suggested: [{ allocationId: source.allocationId, amount: 2_000_000 }],
    cardAvailable: false,
    gateway: null,
    result: null,
    backPath: '/tourism/flights',
  };

  async function render(payment: UpgIntentView = intent) {
    TestBed.configureTestingModule({
      imports: [UpgPayPage],
      providers: [
        { provide: UpgService, useValue: { view: () => of(payment) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ intentId: payment.id }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(UpgPayPage);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const payButton = () =>
      Array.from(root.querySelectorAll('button')).find((button) =>
        button.textContent?.trim().startsWith('پرداخت'),
      )!;
    return { fixture, root, payButton };
  }

  it('enables full credit payment when the wallet exceeds the fare and cards are unavailable', async () => {
    const { payButton } = await render();
    expect(payButton().textContent).toContain('پرداخت از اعتبار');
    expect(payButton().disabled).toBe(false);
  });

  it('caps entered credit at the fare instead of disabling payment', async () => {
    const { fixture, root, payButton } = await render();
    const input = root.querySelector('input')!;
    input.value = String(source.max);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(input.value.replace(/\D/g, '')).toBe(String(intent.amount));
    expect(payButton().disabled).toBe(false);
  });

  it('keeps payment blocked when credit is insufficient and cards are unavailable', async () => {
    const { payButton } = await render({
      ...intent,
      sources: [{ ...source, max: 1_000_000 }],
      suggested: [{ allocationId: source.allocationId, amount: 1_000_000 }],
    });
    expect(payButton().disabled).toBe(true);
  });

  it('reserves the amounts already selected from other credit sources', async () => {
    const { fixture, root, payButton } = await render({
      ...intent,
      sources: [
        source,
        {
          ...source,
          allocationId: 'personal',
          name: 'ماندهٔ برگشتی',
          kind: 'PERSONAL',
        },
      ],
      suggested: [
        { allocationId: source.allocationId, amount: 1_000_000 },
        { allocationId: 'personal', amount: 1_000_000 },
      ],
    });
    const input = root.querySelector('input')!;
    input.value = String(source.max);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(input.value.replace(/\D/g, '')).toBe('1000000');
    expect(payButton().disabled).toBe(false);
  });
});
