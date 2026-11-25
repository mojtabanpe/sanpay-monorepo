/**
 * Staging uses the real hotel/flight providers for search and quotes, so it
 * looks like production, while its payments are simulated. A simulated payment
 * must never become a real ticket or reservation: with
 * `TOURISM_PROVIDER_BOOKING=disabled` the booking step after payment is skipped,
 * the booking is rejected and UPG returns the money. Unset (production) = enabled.
 */
export function providerBookingDisabled(): boolean {
  return process.env.TOURISM_PROVIDER_BOOKING?.toLowerCase() === 'disabled';
}

export const PROVIDER_BOOKING_DISABLED_NOTE =
  'رزرو واقعی در محیط آزمایشی غیرفعال است';
