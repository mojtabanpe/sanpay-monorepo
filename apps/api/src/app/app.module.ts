import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { StoreModule } from './store/store.module';
import { StoresModule } from './stores/stores.module';
import { TourismModule } from './tourism/tourism.module';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WalletsModule,
    PaymentsModule,
    ProfileModule,
    StoreModule,
    StoresModule,
    TourismModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
