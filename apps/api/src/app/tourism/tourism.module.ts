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
      // تا وقتی کلید واقعی هتل‌یار نداریم، `GDS_MODE=mock` در .env دادهٔ نمونه
      // می‌دهد. سرویس گردشگری فقط GdsClient را می‌شناسد و از منبع خبر ندارد.
      provide: GdsClient,
      useClass:
        process.env.GDS_MODE === 'mock' ? GdsMockClient : GdsHttpClient,
    },
  ],
})
export class TourismModule {}
