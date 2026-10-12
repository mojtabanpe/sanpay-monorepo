import { Component, Injectable, inject, signal } from '@angular/core';
import { HlmAlertDialogImports } from '@sanpay/ui/alert-dialog';

export interface ConfirmRequest {
  title: string;
  description: string;
  /** متن دکمهٔ تأیید، مثلاً «حذف» */
  action: string;
  /** کار برگشت‌ناپذیر (حذف) — دکمه قرمز می‌شود */
  destructive?: boolean;
}

/**
 * جایگزین `window.confirm()` — پنجرهٔ پیش‌فرض مرورگر هرگز استفاده نمی‌شود.
 * `ask()` یک Promise برمی‌گرداند تا call site مثل همان `confirm()` خطی بماند.
 * نمایشش با `<app-confirm-host>` در ریشهٔ اپ است.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);
  private resolve: ((confirmed: boolean) => void) | null = null;

  ask(request: ConfirmRequest): Promise<boolean> {
    // درخواست قبلیِ بی‌جواب را رد کن تا Promise معلق نماند
    this.resolve?.(false);
    this.request.set(request);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  answer(confirmed: boolean): void {
    this.resolve?.(confirmed);
    this.resolve = null;
    this.request.set(null);
  }
}

@Component({
  selector: 'app-confirm-host',
  imports: [HlmAlertDialogImports],
  template: `
    <hlm-alert-dialog
      [state]="confirm.request() ? 'open' : 'closed'"
      (stateChanged)="$event === 'closed' && confirm.answer(false)"
    >
      <hlm-alert-dialog-content *hlmAlertDialogPortal>
        @if (confirm.request(); as request) {
          <hlm-alert-dialog-header>
            <h2 hlmAlertDialogTitle>{{ request.title }}</h2>
            <p hlmAlertDialogDescription>{{ request.description }}</p>
          </hlm-alert-dialog-header>
          <hlm-alert-dialog-footer>
            <button hlmAlertDialogCancel (click)="confirm.answer(false)">
              انصراف
            </button>
            <button
              hlmAlertDialogAction
              [variant]="request.destructive ? 'destructive' : 'default'"
              (click)="confirm.answer(true)"
            >
              {{ request.action }}
            </button>
          </hlm-alert-dialog-footer>
        }
      </hlm-alert-dialog-content>
    </hlm-alert-dialog>
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(ConfirmService);
}
