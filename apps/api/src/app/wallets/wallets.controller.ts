import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletsService } from './wallets.service';

@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  list(@Req() request: Request & { user: JwtPayload }) {
    return this.wallets.forEmployee(request.user.sub);
  }
}
