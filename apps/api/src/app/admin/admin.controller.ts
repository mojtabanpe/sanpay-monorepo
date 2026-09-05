import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminCompaniesService } from './admin-companies.service';
import { AdminEmployeesService } from './admin-employees.service';
import { AdminJwtGuard, AdminRequest } from './admin-jwt.guard';
import { AdminReportsService } from './admin-reports.service';
import { AdminStoresService } from './admin-stores.service';
import { AdminWalletsService } from './admin-wallets.service';
import {
  AdjustAllocationDto,
  AdminLoginDto,
  BookingQueryDto,
  BulkAllocateDto,
  ChangeAdminPasswordDto,
  CreateAdminDto,
  CreateAllocationDto,
  CreateCompanyDto,
  CreateEmployeeDto,
  ImportEmployeesDto,
  CreateStoreDto,
  CreateWalletDefinitionDto,
  ListQueryDto,
  PaymentQueryDto,
  SetPasswordDto,
  UpdateAdminDto,
  UpdateAllocationDto,
  UpdateCompanyDto,
  UpdateEmployeeDto,
  UpdateStoreDto,
  UpdateWalletDefinitionDto,
} from './dto/admin.dto';
import { Roles, WRITE_ROLES } from './roles.decorator';

/** ورود داشبورد — تنها مسیر بدون توکن مدیر */
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(AdminJwtGuard)
  me(@Req() request: AdminRequest) {
    return this.auth.profile(request.admin.sub);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtGuard)
  changePassword(
    @Req() request: AdminRequest,
    @Body() dto: ChangeAdminPasswordDto,
  ) {
    return this.auth.changePassword(
      request.admin.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}

/** کاربران داشبورد — فقط مدیر ارشد */
@Controller('admin/admins')
@UseGuards(AdminJwtGuard)
@Roles('SUPER_ADMIN')
export class AdminUsersController {
  constructor(private readonly auth: AdminAuthService) {}

  @Get()
  list() {
    return this.auth.list();
  }

  @Post()
  create(@Body() dto: CreateAdminDto) {
    return this.auth.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.auth.update(id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.auth.resetPassword(id, dto.password);
  }
}

@Controller('admin/companies')
@UseGuards(AdminJwtGuard)
export class AdminCompaniesController {
  constructor(private readonly companies: AdminCompaniesService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.companies.list(query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateCompanyDto) {
    return this.companies.create(dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companies.update(id, dto);
  }
}

@Controller('admin/employees')
@UseGuards(AdminJwtGuard)
export class AdminEmployeesController {
  constructor(private readonly employees: AdminEmployeesService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.employees.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.employees.detail(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateEmployeeDto) {
    return this.employees.create(dto);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  import(@Body() dto: ImportEmployeesDto) {
    return this.employees.import(dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employees.update(id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  resetPassword(@Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.employees.resetPassword(id, dto.password);
  }

  @Post(':id/allocations')
  @Roles(...WRITE_ROLES)
  addAllocation(@Param('id') id: string, @Body() dto: CreateAllocationDto) {
    return this.employees.addAllocation(id, dto);
  }
}

@Controller('admin/allocations')
@UseGuards(AdminJwtGuard)
@Roles(...WRITE_ROLES)
export class AdminAllocationsController {
  constructor(private readonly employees: AdminEmployeesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAllocationDto) {
    return this.employees.updateAllocation(id, dto);
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  adjust(@Param('id') id: string, @Body() dto: AdjustAllocationDto) {
    return this.employees.adjustAllocation(id, dto.amount, dto.note);
  }
}

@Controller('admin/stores')
@UseGuards(AdminJwtGuard)
export class AdminStoresController {
  constructor(private readonly stores: AdminStoresService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.stores.list(query);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.stores.one(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateStoreDto) {
    return this.stores.create(dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.stores.update(id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  resetPassword(@Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.stores.resetPassword(id, dto.password);
  }
}

@Controller('admin/wallet-definitions')
@UseGuards(AdminJwtGuard)
export class AdminWalletsController {
  constructor(private readonly wallets: AdminWalletsService) {}

  @Get()
  list(@Query() query: ListQueryDto) {
    return this.wallets.list(query);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateWalletDefinitionDto) {
    return this.wallets.create(dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateWalletDefinitionDto) {
    return this.wallets.update(id, dto);
  }

  @Post('bulk-allocate')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  bulkAllocate(@Body() dto: BulkAllocateDto) {
    return this.wallets.bulkAllocate(dto);
  }
}

@Controller('admin')
@UseGuards(AdminJwtGuard)
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('overview')
  overview() {
    return this.reports.overview();
  }

  @Get('payments')
  payments(@Query() query: PaymentQueryDto) {
    return this.reports.payments(query);
  }

  @Get('bookings')
  bookings(@Query() query: BookingQueryDto) {
    return this.reports.bookings(query);
  }
}
