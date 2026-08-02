import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { StoreAuthService } from './store-auth.service';
import { StoreJwtGuard } from './store-jwt.guard';
import { StorePaymentsService } from './store-payments.service';
import { StoreController } from './store.controller';

@Module({
  imports: [PaymentsModule],
  controllers: [StoreController],
  providers: [StoreAuthService, StorePaymentsService, StoreJwtGuard],
})
export class StoreModule {}
