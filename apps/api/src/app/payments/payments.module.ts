import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentEventsService } from './payment-events.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentEventsService, JwtAuthGuard],
  exports: [PaymentEventsService, PaymentsService],
})
export class PaymentsModule {}
