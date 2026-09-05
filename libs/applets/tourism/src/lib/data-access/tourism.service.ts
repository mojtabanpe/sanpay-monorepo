import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  BookingQuote,
  BookingReceipt,
  CreateBookingInput,
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  PreviousTraveler,
  TourismCity,
} from '@sanpay/models';
import { Observable } from 'rxjs';

export interface HotelSearchFilters {
  /** YYYY-MM-DD */
  checkin: string;
  nights: number;
  /** شناسهٔ مبهم شهر؛ خالی یعنی همهٔ شهرها */
  cityId: string;
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
  hotels(cityId?: string): Observable<HotelSummary[]> {
    const params = cityId ? new HttpParams().set('cityId', cityId) : undefined;
    return this.http.get<HotelSummary[]>('/api/tourism/hotels', { params });
  }

  hotel(hotelId: string): Observable<HotelDetail> {
    return this.http.get<HotelDetail>(
      `/api/tourism/hotels/${encodeURIComponent(hotelId)}`,
    );
  }

  /** اتاق‌های خالی یک هتل در تاریخ مشخص */
  availability(
    hotelId: string,
    checkin: string,
    nights: number,
    capacity = 2,
  ): Observable<HotelAvailability[]> {
    return this.http.post<HotelAvailability[]>('/api/tourism/search', {
      checkin,
      nights,
      hotelId,
      rate: 0,
      capacity,
    });
  }

  search(filters: HotelSearchFilters): Observable<HotelAvailability[]> {
    // شناسهٔ خالی حذف می‌شود، نه اینکه رشتهٔ خالی برود — بک‌اند «نبودن» را
    // «همهٔ شهرها» می‌فهمد
    const { cityId, ...rest } = filters;
    return this.http.post<HotelAvailability[]>('/api/tourism/search', {
      ...rest,
      ...(cityId ? { cityId } : {}),
    });
  }

  /** پیش‌فاکتور اتاق + کیف‌پول‌های گردشگری قابل استفاده */
  quote(
    hotelId: string,
    roomId: string,
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

  previousTravelers(): Observable<PreviousTraveler[]> {
    return this.http.get<PreviousTraveler[]>('/api/tourism/travelers');
  }
}
