import { parseAmount, toman } from './format';

describe('rial presentation boundary', () => {
  it('shows stored rial as-is, with separators', () => {
    expect(toman(10001)).toBe('۱۰٬۰۰۱ ریال');
    expect(toman(null)).toBe('—');
    expect(toman(0)).toBe('۰ ریال');
  });
  it('parses Persian and Arabic rial inputs without a multiple-of-10 rule', () => {
    expect(parseAmount('۱۰٬۰۰۰')).toBe(10000);
    expect(parseAmount('١٠٠٠٠')).toBe(10000);
    expect(parseAmount('-۱۰٬۰۰۰')).toBe(-10000);
    expect(parseAmount('10001')).toBe(10001);
  });
});
