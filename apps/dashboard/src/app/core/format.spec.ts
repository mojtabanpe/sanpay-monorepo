import { parseAmount, toman } from './format';

describe('rial presentation boundary', () => {
  it('preserves the value of existing balances when displaying rial', () => {
    expect(toman(1000)).toBe('۱۰٬۰۰۰ ریال');
    expect(toman(null)).toBe('—');
    expect(toman(0)).toBe('۰ ریال');
  });
  it('converts Persian and Arabic rial inputs back to the API unit', () => {
    expect(parseAmount('۱۰٬۰۰۰')).toBe(1000);
    expect(parseAmount('١٠٠٠٠')).toBe(1000);
    expect(parseAmount('-۱۰٬۰۰۰')).toBe(-1000);
    expect(parseAmount('10001')).toBe(1000.1);
  });
});
