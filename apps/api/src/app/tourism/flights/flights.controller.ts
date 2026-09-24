import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../../auth/auth.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BookFlightDto, QuoteFlightDto, SearchFlightsDto } from './flights.dto';
import { FlightsService } from './flights.service';

@Controller('tourism/flights')
@UseGuards(JwtAuthGuard)
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}
  @Get('airports') airports() {
    return this.flights.airports();
  }
  @Post('search') search(@Body() dto: SearchFlightsDto) {
    return this.flights.search(dto);
  }
  @Post('quote') quote(@Req() req: Request, @Body() dto: QuoteFlightDto) {
    return this.flights.quote(employeeId(req), dto);
  }
  @Post('bookings') book(@Req() req: Request, @Body() dto: BookFlightDto) {
    return this.flights.book(employeeId(req), dto);
  }
  @Get('bookings') bookings(@Req() req: Request) {
    return this.flights.myBookings(employeeId(req));
  }
  @Get('bookings/:id') receipt(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.flights.receipt(employeeId(req), id);
  }
}
function employeeId(req: Request): string {
  return (req as Request & { user: JwtPayload }).user.sub;
}
