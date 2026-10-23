import { AvatarsModule } from './avatars/avatars.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { StoreModule } from './store/store.module';
import { StoresModule } from './stores/stores.module';
import { TourismModule } from './tourism/tourism.module';
import { WalletsModule } from './wallets/wallets.module';
import { SettlementsModule } from './settlements/settlements.module';
import { UpgModule } from './upg/upg.module';

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
    AdminModule,
    SettlementsModule,
    AvatarsModule,
    UpgModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
