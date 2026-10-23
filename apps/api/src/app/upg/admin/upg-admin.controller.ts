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

  @Get('payments')
  payments(@Query() query: GatewayPaymentQueryDto) {
    return this.admin.payments(query);
  }

  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.admin.payment(id);
  }

  /** استعلام زنده از درگاه — وضعیتی را تغییر نمی‌دهد */
  @Post('payments/:id/inquire')
  @HttpCode(HttpStatus.OK)
  inquirePayment(@Param('id') id: string) {
    return this.admin.inquirePayment(id);
  }

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

  @Post('refunds/:id/inquire')
  @HttpCode(HttpStatus.OK)
  inquireRefund(@Param('id') id: string) {
    return this.admin.inquireRefund(id);
  }

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

  @Get('review-queue')
  queue() {
    return this.admin.queue();
  }

  @Get('review-queue/count')
  queueCount() {
    return this.admin.queueCount();
  }

  @Get('refund-wallets')
  refundWallets() {
    return this.admin.refundWallets();
  }

  @Get('settings')
  settings() {
    return this.admin.settings();
  }
}
