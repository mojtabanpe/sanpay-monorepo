import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  BookingQuote,
  BookingReceipt,
  HotelAvailability,
  HotelDetail,
  HotelSummary,
  TourismCity,
} from '@sanpay/models';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateBookingDto, SearchHotelsDto } from './dto/tourism.dto';
import { TourismService } from './tourism.service';

@Controller('tourism')
@UseGuards(JwtAuthGuard)
export class TourismController {
  constructor(private readonly tourism: TourismService) {}

  @Get('cities')
  cities(): Promise<TourismCity[]> {
    return this.tourism.cities();
  }

  /** `cityId` نداده = همهٔ شهرها */
  @Get('hotels')
  hotels(@Query('cityId') cityId?: string): Promise<HotelSummary[]> {
    return this.tourism.hotels(cityId || null);
  }

  @Get('hotels/:hotelId')
  hotel(@Param('hotelId') hotelId: string): Promise<HotelDetail> {
    return this.tourism.hotel(hotelId);
  }

  /** جست‌وجوی اتاق خالی — POST چون فیلترها بدنه‌دار و غیرقابل کش هستند */
  @Post('search')
  search(@Body() dto: SearchHotelsDto): Promise<HotelAvailability[]> {
    return this.tourism.search(dto);
  }

  /** پیش‌فاکتور یک اتاق + کیف‌پول‌های گردشگری قابل استفاده */
  @Get('quote')
  quote(
    @Req() request: Request,
    @Query('hotelId') hotelId: string,
    @Query('roomId') roomId: string,
    @Query('checkin') checkin: string,
    @Query('nights', ParseIntPipe) nights: number,
  ): Promise<BookingQuote> {
    return this.tourism.quote(
      employeeId(request),
      hotelId,
      roomId,
      checkin,
      nights,
    );
  }

  @Post('bookings')
  book(
    @Req() request: Request,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingReceipt> {
    return this.tourism.book(employeeId(request), dto);
  }

  @Get('bookings')
  myBookings(@Req() request: Request): Promise<BookingReceipt[]> {
    return this.tourism.myBookings(employeeId(request));
  }
}

function employeeId(request: Request): string {
  return (request as Request & { user: JwtPayload }).user.sub;
}
