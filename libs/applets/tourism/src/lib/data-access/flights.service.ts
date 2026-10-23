import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  FlightAirport,
  FlightBookingInput,
  FlightBookingReceipt,
  FlightOffer,
  FlightQuote,
  FlightSearchInput,
  UpgIntentCreated,
} from '@sanpay/models';

@Injectable({ providedIn: 'root' })
export class FlightsService {
  private readonly http = inject(HttpClient);
  airports() {
    return this.http.get<FlightAirport[]>('/api/tourism/flights/airports');
  }
  search(input: FlightSearchInput) {
    return this.http.post<FlightOffer[]>('/api/tourism/flights/search', input);
  }
  quote(input: FlightSearchInput, offerId: string) {
    return this.http.post<FlightQuote>('/api/tourism/flights/quote', {
      ...input,
      offerId,
    });
  }
  /** رزرو ثبت می‌شود و پرداخت به UPG می‌رود */
  book(input: FlightBookingInput) {
    return this.http.post<UpgIntentCreated>(
      '/api/tourism/flights/bookings',
      input,
    );
  }
  bookings() {
    return this.http.get<FlightBookingReceipt[]>(
      '/api/tourism/flights/bookings',
    );
  }
}
