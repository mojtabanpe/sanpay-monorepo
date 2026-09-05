import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { SettlementsService } from './settlements.service';
import { TomanClientService } from './toman-client.service';
import { SettlementsController } from './settlements.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [SettlementsService, TomanClientService, AdminJwtGuard],
  controllers: [SettlementsController],
})
export class SettlementsModule {}
