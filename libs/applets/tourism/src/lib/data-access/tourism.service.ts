import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  BookingQuote,
  BookingReceipt,
  CreateBookingInput,
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
} from '@sanpay/models';
import { Observable } from 'rxjs';

export interface HotelSearchFilters {
  /** YYYY-MM-DD */
  checkin: string;
  nights: number;
  cityId: number;
  /** حداقل ستاره؛ ۰ یعنی بدون فیلتر */
  rate: number;
  /** تعداد نفرات هر اتاق */
  capacity: number;
}

@Injectable({ providedIn: 'root' })
export class TourismService {
  private readonly http = inject(HttpClient);

  cities(): Observable<TourismCity[]> {
    return this.http.get<TourismCity[]>('/api/tourism/cities');
  }

  /** فهرست هتل‌ها؛ `cityId` ندهید یعنی همهٔ شهرها */
  hotels(cityId?: number): Observable<HotelSummary[]> {
    const params =
      cityId && cityId > 0 ? new HttpParams().set('cityId', cityId) : undefined;
    return this.http.get<HotelSummary[]>('/api/tourism/hotels', { params });
  }

  hotel(hotelId: number): Observable<HotelDetail> {
    return this.http.get<HotelDetail>(`/api/tourism/hotels/${hotelId}`);
  }

  /** اتاق‌های خالی یک هتل در تاریخ مشخص */
  availability(
    hotelId: number,
    checkin: string,
    nights: number,
    capacity = 2,
  ): Observable<HotelAvailability[]> {
    return this.http.post<HotelAvailability[]>('/api/tourism/search', {
      checkin,
      nights,
      hotelId,
      cityId: -1,
      rate: 0,
      capacity,
    });
  }

  search(filters: HotelSearchFilters): Observable<HotelAvailability[]> {
    return this.http.post<HotelAvailability[]>('/api/tourism/search', {
      ...filters,
      hotelId: 0,
    });
  }

  /** پیش‌فاکتور اتاق + کیف‌پول‌های گردشگری قابل استفاده */
  quote(
    hotelId: number,
    roomId: number,
    checkin: string,
    nights: number,
  ): Observable<BookingQuote> {
    const params = new HttpParams()
      .set('hotelId', hotelId)
      .set('roomId', roomId)
      .set('checkin', checkin)
      .set('nights', nights);
    return this.http.get<BookingQuote>('/api/tourism/quote', { params });
  }

  book(input: CreateBookingInput): Observable<BookingReceipt> {
    return this.http.post<BookingReceipt>('/api/tourism/bookings', input);
  }

  myBookings(): Observable<BookingReceipt[]> {
    return this.http.get<BookingReceipt[]>('/api/tourism/bookings');
  }
}
