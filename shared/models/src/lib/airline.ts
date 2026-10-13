/**
 * Persian names for the airlines the flight supplier returns. The supplier
 * sends only the IATA code (`W5`, `IR`, …) in `FlightLeg.airline`, which
 * employees cannot read. Unknown codes fall back to the code itself, so a new
 * airline still shows something instead of an empty label.
 */
const AIRLINES: Record<string, string> = {
  IR: 'ایران‌ایر',
  W5: 'ماهان',
  EP: 'آسمان',
  B9: 'ایران‌ایرتور',
  ZV: 'زاگرس',
  QB: 'قشم‌ایر',
  I3: 'آتا',
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

export function airlineName(code: string): string {
  return AIRLINES[code.trim().toUpperCase()] ?? code;
}
