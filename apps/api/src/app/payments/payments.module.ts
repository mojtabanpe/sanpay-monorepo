import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentEventsService } from './payment-events.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentEventsService, JwtAuthGuard],
  exports: [PaymentEventsService],
})
export class PaymentsModule {}
