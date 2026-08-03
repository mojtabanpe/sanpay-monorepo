import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileService } from './profile.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('summary')
  summary(@Req() request: Request & { user: JwtPayload }) {
    return this.profile.summary(request.user.sub);
  }

  /** تاریخچهٔ خرید — `limit` اختیاری (پیش‌فرض ۳۰، حداکثر ۱۰۰) */
  @Get('payments')
  payments(
    @Req() request: Request & { user: JwtPayload },
    @Query('limit') limit?: string,
  ) {
    return this.profile.payments(request.user.sub, Number(limit) || 30);
  }
}
