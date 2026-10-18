/**
 * Persian names for the airlines the flight supplier returns. The supplier
 * supplies names through `/airlines`; prefer that name when available.
 * This table supports older bookings and temporary catalog failures.
 * Unknown codes fall back to the code itself.
 */
const AIRLINES: Record<string, string> = {
  IR: 'ایران‌ایر',
  W5: 'ماهان',
  EP: 'آسمان',
  B9: 'ایران‌ایرتور',
  ZV: 'زاگرس',
  QB: 'قشم‌ایر',
  I3: 'آتا',
  J1: 'معراج',
  JI: 'معراج',
  Y9: 'کیش‌ایر',
  HH: 'تابان',
  NV: 'کارون',
  IV: 'کاسپین',
  IS: 'سپهران',
  TK: 'ترکیش ایرلاینز',
  PC: 'پگاسوس',
  QR: 'قطر ایرویز',
  EK: 'امارات',
  FZ: 'فلای‌دبی',
  G9: 'العربیه',
  J2: 'آزال',
};

export function airlineName(code: string, name?: string): string {
  return name?.trim() || AIRLINES[code.trim().toUpperCase()] || code;
}
