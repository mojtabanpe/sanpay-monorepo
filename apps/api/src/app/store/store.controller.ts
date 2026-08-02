import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, map, merge, timer } from 'rxjs';
import { PaymentEventsService } from '../payments/payment-events.service';
import { StoreLoginDto } from './dto/store-login.dto';
import { StoreAuthService, StoreJwtPayload } from './store-auth.service';
import { StoreJwtGuard } from './store-jwt.guard';
import { StorePaymentsService } from './store-payments.service';

type StoreRequest = Request & { store: StoreJwtPayload };

@Controller('store')
export class StoreController {
  constructor(
    private readonly auth: StoreAuthService,
    private readonly payments: StorePaymentsService,
    private readonly events: PaymentEventsService,
  ) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: StoreLoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(StoreJwtGuard)
  me(@Req() request: StoreRequest) {
    return this.auth.profile(request.store.sub);
  }

  @Get('payments')
  @UseGuards(StoreJwtGuard)
  recent(@Req() request: StoreRequest) {
    return this.payments.recent(request.store.sub);
  }

  /**
   * استریم زندهٔ رسیدها. کلاینت با `fetch` و هدر Authorization می‌خواندش (نه
   * EventSource) تا توکن در URL نیفتد. پالس ۲۵ ثانیه‌ای اتصال را از بسته‌شدن
   * توسط پروکسی‌های میانی حفظ می‌کند.
   */
  @Sse('payments/stream')
  @UseGuards(StoreJwtGuard)
  stream(@Req() request: StoreRequest): Observable<MessageEvent> {
    const receipts = this.events.forStore(request.store.sub).pipe(
      map((receipt): MessageEvent => ({ type: 'payment', data: receipt })),
    );
    const heartbeat = timer(25_000, 25_000).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(receipts, heartbeat);
  }
}
