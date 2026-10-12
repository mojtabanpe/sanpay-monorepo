import {
  caretBeforeDigits,
  formatAmount,
  normalizeAmount,
} from '@sanpay/forms';

// منطق مشترک ورودی مبلغ (`@sanpay/forms`) — اینجا تست می‌شود چون آن lib
// target تست ندارد و داشبورد بیشترین ورودی مبلغ را دارد.
describe('amount input formatting', () => {
  it('groups digits with the Persian thousands separator', () => {
    expect(formatAmount('')).toBe('');
    expect(formatAmount('5')).toBe('5');
    expect(formatAmount('50000')).toBe('50٬000');
    expect(formatAmount('1234567')).toBe('1٬234٬567');
  });

  it('normalizes Persian/Arabic digits, separators and leading zeros', () => {
    expect(normalizeAmount('۵۰٬۰۰۰')).toBe('50000');
    expect(normalizeAmount('٧٠٠')).toBe('700');
    expect(normalizeAmount('1,200 ریال')).toBe('1200');
    expect(normalizeAmount('007')).toBe('7');
    expect(normalizeAmount('0')).toBe('0');
    expect(normalizeAmount('abc')).toBe('');
  });

  it('clamps to max', () => {
    expect(normalizeAmount('99999', 50000)).toBe('50000');
    expect(normalizeAmount('49999', 50000)).toBe('49999');
    expect(normalizeAmount('', 50000)).toBe('');
  });

  it('keeps the caret before the same number of trailing digits', () => {
    // «12٬000» with three digits after the caret → before «000»
    expect(caretBeforeDigits('12٬000', 3)).toBe(3);
    expect(caretBeforeDigits('12٬000', 0)).toBe(6);
    expect(caretBeforeDigits('12٬000', 5)).toBe(0);
  });
});
