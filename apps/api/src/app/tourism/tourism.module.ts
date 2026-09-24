import { FlightsController } from './flights/flights.controller';
import { FlightProvider } from './flights/flight-provider';
import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GdsWebhookGuard } from './gds-webhook.guard';
import { Eghamat24Provider } from './providers/eghamat24/eghamat24.provider';
import { GrsHttpClient } from './providers/eghamat24/grs-http.client';
import { GrsMockClient } from './providers/eghamat24/grs-mock.client';
import { GrsClient } from './providers/eghamat24/grs.types';
import { HotelProviderRouter } from './providers/hotel-provider.router';
import { GdsHttpClient } from './providers/hotelyar/gds-http.client';
import { GdsMockClient } from './providers/hotelyar/gds-mock.client';
import { GdsClient } from './providers/hotelyar/gds.types';
import { HotelyarProvider } from './providers/hotelyar/hotelyar.provider';
import { TourismWebhookController } from './tourism-webhook.controller';
import { TourismWebhookService } from './tourism-webhook.service';
import { TourismController } from './tourism.controller';
import { TourismService } from './tourism.service';
import { FlightsService } from './flights/flights.service';

@Module({
  controllers: [TourismController, TourismWebhookController, FlightsController],
  providers: [
    TourismService,
    TourismWebhookService,
    HotelProviderRouter,
    HotelyarProvider,
    Eghamat24Provider,
    JwtAuthGuard,
    GdsWebhookGuard,
    {
      // `GDS_MODE=live` به API واقعی هتل‌یار وصل می‌شود؛ هر مقدار دیگری (و
      // نبودِ متغیر) عمداً ماک است تا یک .env ناقص به‌جای خطای واضح، نیمه‌کاره
      // به سرور واقعی وصل نشود.
      provide: GdsClient,
      useClass: process.env.GDS_MODE === 'live' ? GdsHttpClient : GdsMockClient,
    },
    {
      provide: GrsClient,
      useClass: process.env.GRS_MODE === 'live' ? GrsHttpClient : GrsMockClient,
    },
    FlightsService,
    FlightProvider,
  ],
})
export class TourismModule {}
