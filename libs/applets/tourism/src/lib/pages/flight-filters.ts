import { FlightLeg, FlightOffer } from '@sanpay/models';
import { PriceRange } from '../ui/filter-sheet';

export type FlightSort = 'cheap' | 'early' | 'short';

/** بازهٔ ساعت حرکتِ پرواز رفت */
export type DaySlot = 'morning' | 'noon' | 'evening' | 'night';

export const DAY_SLOTS: { value: DaySlot; label: string; hint: string }[] = [
  { value: 'morning', label: 'صبح', hint: '۵ تا ۱۱' },
  { value: 'noon', label: 'ظهر', hint: '۱۱ تا ۱۵' },
  { value: 'evening', label: 'عصر', hint: '۱۵ تا ۱۹' },
  { value: 'night', label: 'شب', hint: '۱۹ تا ۵' },
];

export interface FlightFilters {
  /** کد ایرلاین — خالی یعنی همه */
  airlines: string[];
  /** بازهٔ ساعت حرکت رفت — خالی یعنی همه */
  slots: DaySlot[];
  directOnly: boolean;
  /** economy / business / … — خالی یعنی همه */
  classes: string[];
  /** charter / system — خالی یعنی همه */
  types: string[];
  /** مبلغ کل مسافران (تومان) */
  price: PriceRange;
  /** حداقل بار مجاز (کیلوگرم)؛ ۰ یعنی مهم نیست */
  minBaggage: number;
  sort: FlightSort;
}

export const NO_FLIGHT_FILTERS: FlightFilters = {
  airlines: [],
  slots: [],
  directOnly: false,
  classes: [],
  types: [],
  price: null,
  minBaggage: 0,
  sort: 'cheap',
};

export function activeFlightFilters(filters: FlightFilters): number {
  return (
    (filters.airlines.length ? 1 : 0) +
    (filters.slots.length ? 1 : 0) +
    (filters.directOnly ? 1 : 0) +
    (filters.classes.length ? 1 : 0) +
    (filters.types.length ? 1 : 0) +
    (filters.price ? 1 : 0) +
    (filters.minBaggage ? 1 : 0)
  );
}

export function legsOf(offer: FlightOffer): FlightLeg[] {
  return offer.returning ? [offer.departure, offer.returning] : [offer.departure];
}

/**
 * ساعت از رشتهٔ زمانِ تأمین‌کننده (`YYYY-MM-DDTHH:mm…`). عمداً از Date
 * استفاده نمی‌شود: زمان پرواز به وقت محلی فرودگاه است و تبدیل ناحیهٔ زمانی
 * مرورگر آن را جابه‌جا می‌کرد.
 */
function hourOf(time: string): number {
  return Number(time.slice(11, 13));
}

export function daySlot(time: string): DaySlot {
  const hour = hourOf(time);
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'noon';
  if (hour >= 15 && hour < 19) return 'evening';
  return 'night';
}

/** مدت کل پرواز (رفت + برگشت) به دقیقه */
export function durationMinutes(offer: FlightOffer): number {
  return legsOf(offer).reduce(
    (sum, leg) =>
      sum +
      (Date.parse(leg.arrivalTime) - Date.parse(leg.departureTime)) / 60_000,
    0,
  );
}

/**
 * ایرلاین، کلاس و نوع پرواز روی **همهٔ** پاهای سفر سنجیده می‌شوند: پرواز
 * رفت‌وبرگشتی که برگشتش چارتر است، برای «فقط سیستمی» نباید بیاید. ساعت حرکت
 * فقط مال پرواز رفت است — همان چیزی که کاربر موقع انتخاب به آن فکر می‌کند.
 */
export function applyFlightFilters(
  offers: FlightOffer[],
  filters: FlightFilters,
): FlightOffer[] {
  const airlines = new Set(filters.airlines);
  const slots = new Set(filters.slots);
  const classes = new Set(filters.classes);
  const types = new Set(filters.types);

  const result = offers.filter((offer) => {
    const legs = legsOf(offer);
    if (airlines.size && !legs.every((leg) => airlines.has(leg.airline)))
      return false;
    if (slots.size && !slots.has(daySlot(offer.departure.departureTime)))
      return false;
    if (filters.directOnly && legs.some((leg) => leg.stops > 0)) return false;
    if (classes.size && !legs.every((leg) => classes.has(leg.flightClass)))
      return false;
    if (types.size && !legs.every((leg) => types.has(leg.flightType)))
      return false;
    if (
      filters.price &&
      (offer.amount < filters.price[0] || offer.amount > filters.price[1])
    )
      return false;
    if (legs.some((leg) => leg.baggage < filters.minBaggage)) return false;
    return true;
  });

  switch (filters.sort) {
    case 'cheap':
      return result.sort((a, b) => a.amount - b.amount);
    case 'early':
      return result.sort((a, b) =>
        a.departure.departureTime.localeCompare(b.departure.departureTime),
      );
    case 'short':
      return result.sort(
        (a, b) => durationMinutes(a) - durationMinutes(b) || a.amount - b.amount,
      );
  }
}

/** مقادیر متمایز یک فیلد در همهٔ پاهای پروازها، با تعداد پرواز — پرتعدادترین اول */
export function flightOptions(
  offers: FlightOffer[],
  pick: (leg: FlightLeg) => string,
  selected: string[],
): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const offer of offers) {
    for (const value of new Set(legsOf(offer).map(pick))) {
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  for (const value of selected) if (!counts.has(value)) counts.set(value, 0);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** مقادیر متمایز بار مجاز بزرگ‌تر از صفر، صعودی — گزینه‌های «حداقل بار» */
export function baggageOptions(offers: FlightOffer[]): number[] {
  return [
    ...new Set(
      offers.flatMap((offer) => legsOf(offer).map((leg) => leg.baggage)),
    ),
  ]
    .filter((kg) => kg > 0)
    .sort((a, b) => a - b);
}

export function flightPriceBounds(
  offers: FlightOffer[],
): readonly [number, number] | null {
  if (offers.length === 0) return null;
  const amounts = offers.map((offer) => offer.amount);
  return [Math.min(...amounts), Math.max(...amounts)];
}

const CLASS_LABELS: Record<string, string> = {
  economy: 'اکونومی',
  premium_economy: 'پریمیوم اکونومی',
  business: 'بیزینس',
  first: 'فرست',
};

export function flightClassLabel(value: string): string {
  return CLASS_LABELS[value] ?? value;
}

const TYPE_LABELS: Record<string, string> = {
  charter: 'چارتر',
  system: 'سیستمی',
};

export function flightTypeLabel(value: string): string {
  return TYPE_LABELS[value] ?? value;
}
