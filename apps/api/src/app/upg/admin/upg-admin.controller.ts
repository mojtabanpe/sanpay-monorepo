import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtGuard, AdminRequest } from '../../admin/admin-jwt.guard';
import { AdminAccess, AnyAdminPermission } from '../../admin/permissions.decorator';
import { Roles, WRITE_ROLES } from '../../admin/roles.decorator';
import { GatewayPaymentQueryDto, UpgReviewDto } from './upg-admin.dto';
import { UpgAdminService } from './upg-admin.service';

/**
 * UPG در داشبورد. خواندن برای همهٔ نقش‌ها؛ هر تصمیم دستی فقط `WRITE_ROLES`
 * (VIEWER فقط می‌خواند — سمت سرور اعمال می‌شود، نه فقط در UI).
 */
@Controller('admin/upg')
@UseGuards(AdminJwtGuard)
export class UpgAdminController {
  constructor(private readonly admin: UpgAdminService) {}

  @AnyAdminPermission('gateway-payments:read', 'upg-review:read')
  @Get('payments')
  payments(@Query() query: GatewayPaymentQueryDto) {
    return this.admin.payments(query);
  }

  @AnyAdminPermission('gateway-payments:read', 'upg-review:read')
  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.admin.payment(id);
  }

  /** استعلام زنده از درگاه — وضعیتی را تغییر نمی‌دهد */
  @AnyAdminPermission('gateway-payments:read', 'upg-review:read')
  @Post('payments/:id/inquire')
  @HttpCode(HttpStatus.OK)
  inquirePayment(@Param('id') id: string) {
    return this.admin.inquirePayment(id);
  }

  @AdminAccess('upg-review')
  @Post('payments/:id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  reviewPayment(
    @Param('id') id: string,
    @Body() dto: UpgReviewDto,
    @Req() request: AdminRequest,
  ) {
    return this.admin.reviewPayment(id, dto, request.admin);
  }

  @AnyAdminPermission('gateway-payments:read', 'upg-review:read')
  @Post('refunds/:id/inquire')
  @HttpCode(HttpStatus.OK)
  inquireRefund(@Param('id') id: string) {
    return this.admin.inquireRefund(id);
  }

  @AdminAccess('upg-review')
  @Post('refunds/:id/review')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  reviewRefund(
    @Param('id') id: string,
    @Body() dto: UpgReviewDto,
    @Req() request: AdminRequest,
  ) {
    return this.admin.reviewRefund(id, dto, request.admin);
  }

  @AnyAdminPermission('upg-review:read')
  @Get('review-queue')
  queue() {
    return this.admin.queue();
  }

  @AnyAdminPermission('upg-review:read')
  @Get('review-queue/count')
  queueCount() {
    return this.admin.queueCount();
  }

  @AnyAdminPermission('gateways:read')
  @Get('refund-wallets')
  refundWallets() {
    return this.admin.refundWallets();
  }

  @AnyAdminPermission('gateways:read')
  @Get('settings')
  settings() {
    return this.admin.settings();
  }
}
