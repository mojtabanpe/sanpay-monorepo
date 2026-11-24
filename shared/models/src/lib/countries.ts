export interface CountryOption {
  /** ISO 3166-1 alpha-2 uppercase code (e.g. IR, TR, AE) */
  code: string;
  /** نام فارسی کشور */
  nameFa: string;
  /** نام انگلیسی کشور برای جست‌وجوی لاتین */
  nameEn: string;
}

/**
 * فهرست کشورهای پرکاربرد برای تابعیت و کشور صادرکنندهٔ گذرنامه.
 * ایران در صدر است و سپس کشورهای پرتردد و سایر مقاصد رایج.
 */
export const COUNTRIES: readonly CountryOption[] = [
  { code: 'IR', nameFa: 'ایران', nameEn: 'Iran' },
  { code: 'TR', nameFa: 'ترکیه', nameEn: 'Turkey' },
  { code: 'AE', nameFa: 'امارات متحده عربی', nameEn: 'United Arab Emirates' },
  { code: 'IQ', nameFa: 'عراق', nameEn: 'Iraq' },
  { code: 'OM', nameFa: 'عمان', nameEn: 'Oman' },
  { code: 'QA', nameFa: 'قطر', nameEn: 'Qatar' },
  { code: 'AM', nameFa: 'ارمنستان', nameEn: 'Armenia' },
  { code: 'GE', nameFa: 'گرجستان', nameEn: 'Georgia' },
  { code: 'AZ', nameFa: 'آذربایجان', nameEn: 'Azerbaijan' },
  { code: 'SA', nameFa: 'عربستان سعودی', nameEn: 'Saudi Arabia' },
  { code: 'KW', nameFa: 'کویت', nameEn: 'Kuwait' },
  { code: 'BH', nameFa: 'بحرین', nameEn: 'Bahrain' },
  { code: 'AF', nameFa: 'افغانستان', nameEn: 'Afghanistan' },
  { code: 'PK', nameFa: 'پاکستان', nameEn: 'Pakistan' },
  { code: 'DE', nameFa: 'آلمان', nameEn: 'Germany' },
  { code: 'FR', nameFa: 'فرانسه', nameEn: 'France' },
  { code: 'GB', nameFa: 'بریتانیا', nameEn: 'United Kingdom' },
  { code: 'IT', nameFa: 'ایتالیا', nameEn: 'Italy' },
  { code: 'ES', nameFa: 'اسپانیا', nameEn: 'Spain' },
  { code: 'NL', nameFa: 'هلند', nameEn: 'Netherlands' },
  { code: 'SE', nameFa: 'سوئد', nameEn: 'Sweden' },
  { code: 'CH', nameFa: 'سوئیس', nameEn: 'Switzerland' },
  { code: 'AT', nameFa: 'اتریش', nameEn: 'Austria' },
  { code: 'BE', nameFa: 'بلژیک', nameEn: 'Belgium' },
  { code: 'DK', nameFa: 'دانمارک', nameEn: 'Denmark' },
  { code: 'NO', nameFa: 'نروژ', nameEn: 'Norway' },
  { code: 'FI', nameFa: 'فنلاند', nameEn: 'Finland' },
  { code: 'GR', nameFa: 'یونان', nameEn: 'Greece' },
  { code: 'PT', nameFa: 'پرتغال', nameEn: 'Portugal' },
  { code: 'PL', nameFa: 'لهستان', nameEn: 'Poland' },
  { code: 'CZ', nameFa: 'جمهوری چک', nameEn: 'Czechia' },
  { code: 'HU', nameFa: 'مجارستان', nameEn: 'Hungary' },
  { code: 'CY', nameFa: 'قبرس', nameEn: 'Cyprus' },
  { code: 'RU', nameFa: 'روسیه', nameEn: 'Russia' },
  { code: 'UA', nameFa: 'اوکراین', nameEn: 'Ukraine' },
  { code: 'BY', nameFa: 'بلاروس', nameEn: 'Belarus' },
  { code: 'CA', nameFa: 'کانادا', nameEn: 'Canada' },
  { code: 'US', nameFa: 'ایالات متحده آمریکا', nameEn: 'United States' },
  { code: 'AU', nameFa: 'استرالیا', nameEn: 'Australia' },
  { code: 'NZ', nameFa: 'نیوزیلند', nameEn: 'New Zealand' },
  { code: 'CN', nameFa: 'چین', nameEn: 'China' },
  { code: 'JP', nameFa: 'ژاپن', nameEn: 'Japan' },
  { code: 'KR', nameFa: 'کره جنوبی', nameEn: 'South Korea' },
  { code: 'MY', nameFa: 'مالزی', nameEn: 'Malaysia' },
  { code: 'TH', nameFa: 'تایلند', nameEn: 'Thailand' },
  { code: 'ID', nameFa: 'اندونزی', nameEn: 'Indonesia' },
  { code: 'SG', nameFa: 'سنگاپور', nameEn: 'Singapore' },
  { code: 'IN', nameFa: 'هند', nameEn: 'India' },
  { code: 'VN', nameFa: 'ویتنام', nameEn: 'Vietnam' },
  { code: 'PH', nameFa: 'فیلیپین', nameEn: 'Philippines' },
  { code: 'LK', nameFa: 'سری‌لانکا', nameEn: 'Sri Lanka' },
  { code: 'MV', nameFa: 'مالدیو', nameEn: 'Maldives' },
  { code: 'KZ', nameFa: 'قزاقستان', nameEn: 'Kazakhstan' },
  { code: 'UZ', nameFa: 'ازبکستان', nameEn: 'Uzbekistan' },
  { code: 'TM', nameFa: 'ترکمنستان', nameEn: 'Turkmenistan' },
  { code: 'TJ', nameFa: 'تاجیکستان', nameEn: 'Tajikistan' },
  { code: 'KG', nameFa: 'قرقیزستان', nameEn: 'Kyrgyzstan' },
  { code: 'LB', nameFa: 'لبنان', nameEn: 'Lebanon' },
  { code: 'SY', nameFa: 'سوریه', nameEn: 'Syria' },
  { code: 'JO', nameFa: 'اردن', nameEn: 'Jordan' },
  { code: 'EG', nameFa: 'مصر', nameEn: 'Egypt' },
  { code: 'MA', nameFa: 'مراکش', nameEn: 'Morocco' },
  { code: 'TN', nameFa: 'تونس', nameEn: 'Tunisia' },
  { code: 'ZA', nameFa: 'آفریقای جنوبی', nameEn: 'South Africa' },
  { code: 'BR', nameFa: 'برزیل', nameEn: 'Brazil' },
  { code: 'AR', nameFa: 'آرژانتین', nameEn: 'Argentina' },
  { code: 'MX', nameFa: 'مکزیک', nameEn: 'Mexico' },
];

const BY_CODE = new Map<string, CountryOption>(
  COUNTRIES.map((country) => [country.code, country]),
);

export function countryByCode(code: string | undefined | null): CountryOption | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

/** برچسب خوانای کشور: «ایران (IR)» یا خود کد اگر در فهرست نبود */
export function countryLabel(code: string | undefined | null): string {
  const normalized = code?.trim().toUpperCase() ?? '';
  if (!normalized) return '';
  const match = BY_CODE.get(normalized);
  return match ? `${match.nameFa} (${match.code})` : normalized;
}
