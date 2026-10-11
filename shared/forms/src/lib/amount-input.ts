import { Directive, ElementRef, effect, inject, input, model } from '@angular/core';
import {
  caretBeforeDigits,
  countDigits,
  formatAmount,
  normalizeAmount,
} from './amount-format';

/**
 * ورودی مبلغ با جداکنندهٔ سه‌رقمی، روی هر `<input hlmInput>`:
 *
 * ```html
 * <input hlmInput [(sanpayAmount)]="amount" [sanpayAmountMax]="1000000" />
 * ```
 *
 * - مدل رشتهٔ ارقام لاتینِ خالص است («50000»)؛ input «50٬000» نشان می‌دهد.
 * - ارقام فارسی/عربی در تایپ و paste پذیرفته می‌شوند.
 * - caret بعد از فرمت‌شدن سر جای خودش (نسبت به ارقام سمت راستش) می‌ماند.
 * - `sanpayAmountMax` مقدار را همان لحظه به سقف می‌رساند.
 * - بدون binding هم کار می‌کند (`#ref` + `ref.value`)؛ آن‌وقت parse باید
 *   جداکننده را دور بریزد — `parseAmount` داشبورد همین کار را می‌کند.
 *
 * کد ملی، موبایل و کد پرسنلی این directive را **نگیرند**؛ جداکننده آن‌ها را
 * عدد جلوه می‌دهد.
 */
@Directive({
  selector: 'input[sanpayAmount]',
  host: {
    inputmode: 'numeric',
    autocomplete: 'off',
    '(input)': 'onInput()',
  },
})
export class SanpayAmountInput {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);

  /** ارقام لاتین بدون جداکننده؛ رشتهٔ خالی یعنی خالی */
  readonly sanpayAmount = model<string>('');
  readonly sanpayAmountMax = input<number | null | undefined>(undefined);

  constructor() {
    // نوشتن از بیرون (ریست فرم، دکمهٔ «حداکثر») → متن input
    effect(() => {
      const digits = normalizeAmount(this.sanpayAmount() ?? '');
      const el = this.element.nativeElement;
      if (normalizeAmount(el.value) !== digits) el.value = formatAmount(digits);
    });
  }

  protected onInput(): void {
    const el = this.element.nativeElement;
    const digitsAfterCaret = countDigits(
      el.value.slice(el.selectionEnd ?? el.value.length),
    );
    const digits = normalizeAmount(el.value, this.sanpayAmountMax());
    const text = formatAmount(digits);

    if (el.value !== text) {
      el.value = text;
      const caret = caretBeforeDigits(
        text,
        Math.min(digitsAfterCaret, digits.length),
      );
      el.setSelectionRange(caret, caret);
    }
    this.sanpayAmount.set(digits);
  }
}
