import { Module } from '@nestjs/common';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { AuthModule } from '../auth/auth.module';
import { UpgAdminController } from './admin/upg-admin.controller';
import { UpgAdminService } from './admin/upg-admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CardRefundService } from './card-refund.service';
import { GatewayRegistry } from './gateways/gateway.registry';
import {
  UpgCallbackController,
  UpgCardRefundController,
  UpgController,
} from './upg.controller';
import { UpgService } from './upg.service';

/**
 * UPG — درگاه پرداخت یکپارچه. بخش‌های خرید این ماژول را import می‌کنند،
 * fulfiller خود را در `onModuleInit` ثبت می‌کنند و فقط intent می‌سازند.
 */
@Module({
  imports: [AuthModule],
  controllers: [
    UpgController,
    UpgCardRefundController,
    UpgCallbackController,
    UpgAdminController,
  ],
  providers: [
    UpgService,
    CardRefundService,
    GatewayRegistry,
    UpgAdminService,
    JwtAuthGuard,
    AdminJwtGuard,
  ],
  exports: [UpgService],
})
export class UpgModule {}
