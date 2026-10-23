import { Component, Injectable, inject, signal } from '@angular/core';
import { HlmAlertDialogImports } from '@sanpay/ui/alert-dialog';
import { HlmFieldImports } from '@sanpay/ui/field';
import { HlmTextareaImports } from '@sanpay/ui/textarea';

export interface ConfirmRequest {
  title: string;
  description: string;
  /** متن دکمهٔ تأیید، مثلاً «حذف» */
  action: string;
  /** کار برگشت‌ناپذیر (حذف) — دکمه قرمز می‌شود */
  destructive?: boolean;
  /**
   * یادداشت اجباری (مثلاً یادداشت حسابرسی بررسی دستی). فقط با `askNote`؛
   * دکمهٔ تأیید تا رسیدن به `minLength` نویسه غیرفعال می‌ماند.
   */
  note?: { label: string; placeholder?: string; minLength?: number };
}

/**
 * جایگزین `window.confirm()` — پنجرهٔ پیش‌فرض مرورگر هرگز استفاده نمی‌شود.
 * `ask()` یک Promise برمی‌گرداند تا call site مثل همان `confirm()` خطی بماند.
 * نمایشش با `<app-confirm-host>` در ریشهٔ اپ است.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly request = signal<ConfirmRequest | null>(null);
  /** متن فیلد یادداشت، وقتی درخواست `note` دارد */
  readonly note = signal('');
  private resolve: ((confirmed: boolean) => void) | null = null;
  private answeredNote = '';

  ask(request: ConfirmRequest): Promise<boolean> {
    // درخواست قبلیِ بی‌جواب را رد کن تا Promise معلق نماند
    this.resolve?.(false);
    this.note.set('');
    this.request.set(request);
    return new Promise((resolve) => (this.resolve = resolve));
  }

  /** مثل `ask` با فیلد یادداشت؛ انصراف = `null` */
  async askNote(
    request: ConfirmRequest & { note: NonNullable<ConfirmRequest['note']> },
  ): Promise<string | null> {
    return (await this.ask(request)) ? this.answeredNote : null;
  }

  /** آیا دکمهٔ تأیید فعال است؟ (یادداشت اجباری هنوز کوتاه نیست) */
  noteMissing(request: ConfirmRequest): boolean {
    return (
      !!request.note &&
      this.note().trim().length < (request.note.minLength ?? 1)
    );
  }

  answer(confirmed: boolean): void {
    const request = this.request();
    if (confirmed && request && this.noteMissing(request)) return;
    this.answeredNote = this.note().trim();
    this.resolve?.(confirmed);
    this.resolve = null;
    this.request.set(null);
  }
}

@Component({
  selector: 'app-confirm-host',
  imports: [HlmAlertDialogImports, HlmFieldImports, HlmTextareaImports],
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
          @if (request.note; as note) {
            <hlm-field>
              <label hlmFieldLabel for="confirm-note">{{ note.label }}</label>
              <textarea
                hlmTextarea
                id="confirm-note"
                rows="3"
                [placeholder]="note.placeholder ?? ''"
                [value]="confirm.note()"
                (input)="confirm.note.set($any($event.target).value)"
              ></textarea>
            </hlm-field>
          }
          <hlm-alert-dialog-footer>
            <button hlmAlertDialogCancel (click)="confirm.answer(false)">
              انصراف
            </button>
            <button
              hlmAlertDialogAction
              [variant]="request.destructive ? 'destructive' : 'default'"
              [disabled]="confirm.noteMissing(request)"
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
