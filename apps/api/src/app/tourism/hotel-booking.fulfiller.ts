import { Injectable, OnModuleInit } from '@nestjs/common';
import { UpgResult } from '@sanpay/models';
import { PaymentIntent } from '../../generated/prisma/client';
import { UpgService } from '../upg/upg.service';
import { UpgFulfiller } from '../upg/upg.types';
import { TourismService } from './tourism.service';

/** رزرو هتل روی UPG */
@Injectable()
export class HotelBookingFulfiller implements UpgFulfiller, OnModuleInit {
  readonly purpose = 'HOTEL' as const;

  constructor(
    private readonly upg: UpgService,
    private readonly tourism: TourismService,
  ) {}

  onModuleInit(): void {
    this.upg.register(this);
  }

  fulfill(intent: PaymentIntent): Promise<void> {
    return this.tourism.fulfillBooking(intent);
  }

  abandon(intent: PaymentIntent): Promise<void> {
    return this.tourism.abandonBooking(intent);
  }

  async result(): Promise<UpgResult> {
    return { kind: 'link', path: '/tourism/bookings', label: 'مشاهدهٔ رزروها' };
  }

  backPath(): string {
    return '/tourism';
  }
}
