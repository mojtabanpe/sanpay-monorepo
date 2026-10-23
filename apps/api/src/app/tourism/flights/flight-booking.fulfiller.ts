import { Injectable, OnModuleInit } from '@nestjs/common';
import { UpgResult } from '@sanpay/models';
import { PaymentIntent } from '../../../generated/prisma/client';
import { UpgService } from '../../upg/upg.service';
import { UpgFulfiller } from '../../upg/upg.types';
import { FlightsService } from './flights.service';

/** رزرو پرواز روی UPG */
@Injectable()
export class FlightBookingFulfiller implements UpgFulfiller, OnModuleInit {
  readonly purpose = 'FLIGHT' as const;

  constructor(
    private readonly upg: UpgService,
    private readonly flights: FlightsService,
  ) {}

  onModuleInit(): void {
    this.upg.register(this);
  }

  fulfill(intent: PaymentIntent): Promise<void> {
    return this.flights.fulfillBooking(intent);
  }

  abandon(intent: PaymentIntent): Promise<void> {
    return this.flights.abandonBooking(intent);
  }

  async result(): Promise<UpgResult> {
    return {
      kind: 'link',
      path: '/tourism/flight-bookings',
      label: 'مشاهدهٔ بلیت‌ها',
    };
  }

  backPath(): string {
    return '/tourism/flights';
  }
}
