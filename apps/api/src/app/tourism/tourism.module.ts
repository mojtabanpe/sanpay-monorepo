import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GdsWebhookGuard } from './gds-webhook.guard';
import { GdsHttpClient } from './gds/gds-http.client';
import { GdsMockClient } from './gds/gds-mock.client';
import { GdsClient } from './gds/gds.types';
import { TourismWebhookController } from './tourism-webhook.controller';
import { TourismWebhookService } from './tourism-webhook.service';
import { TourismController } from './tourism.controller';
import { TourismService } from './tourism.service';

@Module({
  controllers: [TourismController, TourismWebhookController],
  providers: [
    TourismService,
    TourismWebhookService,
    JwtAuthGuard,
    GdsWebhookGuard,
    {
      // `GDS_MODE=live` به API واقعی هتل‌یار وصل می‌شود؛ هر مقدار دیگری (و
      // نبودِ متغیر) عمداً ماک است تا یک .env ناقص به‌جای خطای واضح، نیمه‌کاره
      // به سرور واقعی وصل نشود. سرویس گردشگری فقط GdsClient را می‌شناسد.
      provide: GdsClient,
      useClass:
        process.env.GDS_MODE === 'live' ? GdsHttpClient : GdsMockClient,
    },
  ],
})
export class TourismModule {}
