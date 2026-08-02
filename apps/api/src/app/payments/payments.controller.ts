import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** بعد از اسکن QR: فروشگاه + کیف‌پول‌های قابل استفاده با سقف هرکدام */
  @Get('checkout/:storeCode')
  checkout(
    @Req() request: Request & { user: JwtPayload },
    @Param('storeCode') storeCode: string,
  ) {
    return this.payments.checkout(request.user.sub, storeCode);
  }

  @Post('payments')
  create(
    @Req() request: Request & { user: JwtPayload },
    @Body() dto: CreatePaymentDto,
  ) {
    return this.payments.create(request.user.sub, dto);
  }
}
