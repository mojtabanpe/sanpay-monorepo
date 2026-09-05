import { Module } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminCompaniesService } from './admin-companies.service';
import { AdminEmployeesService } from './admin-employees.service';
import { AdminJwtGuard } from './admin-jwt.guard';
import { AdminReportsService } from './admin-reports.service';
import { AdminStoresService } from './admin-stores.service';
import { AdminWalletsService } from './admin-wallets.service';
import {
  AdminAllocationsController,
  AdminAuthController,
  AdminCompaniesController,
  AdminEmployeesController,
  AdminReportsController,
  AdminStoresController,
  AdminUsersController,
  AdminWalletsController,
} from './admin.controller';

/**
 * داشبورد مدیریت (`apps/dashboard`). JwtModule سراسری در AuthModule ثبت شده،
 * پس اینجا فقط سرویس‌ها و کنترلرها می‌آیند.
 */
@Module({
  controllers: [
    AdminAuthController,
    AdminUsersController,
    AdminCompaniesController,
    AdminEmployeesController,
    AdminAllocationsController,
    AdminStoresController,
    AdminWalletsController,
    AdminReportsController,
  ],
  providers: [
    AdminAuthService,
    AdminCompaniesService,
    AdminEmployeesService,
    AdminStoresService,
    AdminWalletsService,
    AdminReportsService,
    AdminJwtGuard,
  ],
})
export class AdminModule {}
