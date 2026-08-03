import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StoresService } from './stores.service';

@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  /** فروشگاه‌های قابل استفاده با کیف‌پول‌های کارمند */
  @Get()
  list(@Req() request: Request & { user: JwtPayload }) {
    return this.stores.forEmployee(request.user.sub);
  }
}
