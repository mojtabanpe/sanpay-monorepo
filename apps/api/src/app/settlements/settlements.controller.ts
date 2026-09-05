import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { Roles, WRITE_ROLES } from '../admin/roles.decorator';
import { SettlementsService } from './settlements.service';

@Controller('admin/settlements')
@UseGuards(AdminJwtGuard)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  list() {
    return this.settlements.list();
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.settlements.one(id);
  }

  @Post('run')
  @Roles(...WRITE_ROLES)
  run() {
    return this.settlements.runManual();
  }

  @Post(':id/reconcile')
  @Roles(...WRITE_ROLES)
  reconcile(@Param('id') id: string) {
    return this.settlements.reconcileBatch(id);
  }
}
