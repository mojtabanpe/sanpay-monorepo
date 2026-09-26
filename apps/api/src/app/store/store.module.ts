import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';
import { StoreAuthService } from './store-auth.service';
import { StoreJwtGuard } from './store-jwt.guard';
import { StorePaymentsService } from './store-payments.service';
import { StoreController } from './store.controller';
import { MerchantPaymentsService } from './merchant-payments.service';

@Module({
  imports: [PaymentsModule, AuthModule],
  controllers: [StoreController],
  providers: [
    StoreAuthService,
    StorePaymentsService,
    StoreJwtGuard,
    MerchantPaymentsService,
  ],
})
export class StoreModule {}
