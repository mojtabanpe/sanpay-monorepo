import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { AuthModule } from '../auth/auth.module';
import { UpgModule } from '../upg/upg.module';
import { StoreAuthService } from './store-auth.service';
import { StoreJwtGuard } from './store-jwt.guard';
import { StorePaymentsService } from './store-payments.service';
import { StoreController } from './store.controller';
import { MerchantPaymentsService } from './merchant-payments.service';
import { StorePasswordService } from './store-password.service';

@Module({
  imports: [PaymentsModule, AuthModule, UpgModule],
  controllers: [StoreController],
  providers: [
    StoreAuthService,
    StorePaymentsService,
    StoreJwtGuard,
    MerchantPaymentsService,
    StorePasswordService,
  ],
})
export class StoreModule {}
