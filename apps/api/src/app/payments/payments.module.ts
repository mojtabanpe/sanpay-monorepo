import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentEventsService } from './payment-events.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StorePaymentFulfiller } from './store-payment.fulfiller';
import { UpgModule } from '../upg/upg.module';

@Module({
  imports: [AuthModule, UpgModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentEventsService,
    StorePaymentFulfiller,
    JwtAuthGuard,
  ],
  exports: [PaymentEventsService, PaymentsService],
})
export class PaymentsModule {}
