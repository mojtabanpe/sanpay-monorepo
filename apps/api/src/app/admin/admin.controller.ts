import {
  Body,
  Delete,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AVATAR_MAX_BYTES,
  AvatarService,
  type UploadedImage,
} from '../avatars/avatar.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminCompaniesService } from './admin-companies.service';
import { AdminEmployeesService } from './admin-employees.service';
import { AdminJwtGuard, AdminRequest } from './admin-jwt.guard';
import { AdminReportsService } from './admin-reports.service';
import { AdminTourismSplitService } from './admin-tourism-split.service';
import { AdminStoresService } from './admin-stores.service';
import { AdminWalletsService } from './admin-wallets.service';
import {
  AdjustAllocationDto,
  TopUpAllocationDto,
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
  FlightBookingQueryDto,
  TourismSplitQueryDto,
  ListQueryDto,
  PaymentQueryDto,
  SetPasswordDto,
  UpdateAdminDto,
  UpdateAllocationDto,
  UpdateCompanyDto,
  UpdateEmployeeDto,
  UpdateStoreDto,
  UpdateWalletDefinitionDto,
  DeleteWalletDefinitionDto,
} from './dto/admin.dto';
import { AdminAccess, AnyAdminPermission } from './permissions.decorator';
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
@AdminAccess('companies')
export class AdminCompaniesController {
  constructor(private readonly companies: AdminCompaniesService) {}

  @AnyAdminPermission('companies:read', 'employees:read', 'wallets:read')
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
@AdminAccess('employees')
export class AdminEmployeesController {
  constructor(
    private readonly employees: AdminEmployeesService,
    private readonly avatars: AvatarService,
  ) {}

  /** عکس پروفایل کارمند — فیلد multipart `file`، حداکثر ۲MB، JPEG/PNG/WebP */
  @Post(':id/avatar')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  setAvatar(@Param('id') id: string, @UploadedFile() file: UploadedImage) {
    return this.avatars.set(id, file);
  }

  @Delete(':id/avatar')
  @Roles(...WRITE_ROLES)
  removeAvatar(@Param('id') id: string) {
    return this.avatars.remove(id);
  }

  @Get()
  @AnyAdminPermission('employees:read', 'wallets:read')
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

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  remove(@Param('id') id: string) {
    return this.employees.remove(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  resetPassword(@Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.employees.resetPassword(id, dto.password);
  }

  @AdminAccess('wallets')
  @Post(':id/allocations')
  @Roles(...WRITE_ROLES)
  addAllocation(@Param('id') id: string, @Body() dto: CreateAllocationDto) {
    return this.employees.addAllocation(id, dto);
  }
}

@Controller('admin/allocations')
@UseGuards(AdminJwtGuard)
@Roles(...WRITE_ROLES)
@AdminAccess('wallets')
export class AdminAllocationsController {
  constructor(private readonly employees: AdminEmployeesService) {}

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAllocationDto) {
    return this.employees.updateAllocation(id, dto);
  }

  @Post(':id/top-up')
  @HttpCode(HttpStatus.OK)
  topUp(@Param('id') id: string, @Body() dto: TopUpAllocationDto) {
    return this.employees.topUpAllocation(id, dto.amount);
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  adjust(@Param('id') id: string, @Body() dto: AdjustAllocationDto) {
    return this.employees.adjustAllocation(id, dto.amount, dto.note);
  }
}

@Controller('admin/stores')
@UseGuards(AdminJwtGuard)
@AdminAccess('stores')
export class AdminStoresController {
  constructor(private readonly stores: AdminStoresService) {}

  @Get()
  @AnyAdminPermission('stores:read', 'wallets:read', 'payments:read')
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

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  remove(@Param('id') id: string) {
    return this.stores.remove(id);
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
@AdminAccess('wallets')
export class AdminWalletsController {
  constructor(private readonly wallets: AdminWalletsService) {}

  @Get()
  @AnyAdminPermission('wallets:read', 'employees:read')
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

  /** حذف کیف پول فقط برای سوپر ادمین — اعتبار باقی‌ماندهٔ کارمندان از بین می‌رود */
  @Get(':id/deletion-preview')
  @Roles('SUPER_ADMIN')
  deletionPreview(@Param('id') id: string) {
    return this.wallets.deletionPreview(id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(
    @Req() request: AdminRequest,
    @Param('id') id: string,
    @Body() dto: DeleteWalletDefinitionDto,
  ) {
    return this.wallets.remove(id, dto.note, request.admin.sub);
  }
}

@Controller('admin')
@UseGuards(AdminJwtGuard)
export class AdminReportsController {
  constructor(
    private readonly reports: AdminReportsService,
    private readonly tourismSplit: AdminTourismSplitService,
  ) {}

  @AdminAccess('overview')
  @Get('overview')
  overview() {
    return this.reports.overview();
  }

  @AdminAccess('payments')
  @Get('payments')
  payments(@Query() query: PaymentQueryDto) {
    return this.reports.payments(query);
  }

  @AdminAccess('payments')
  @Get('payments.xlsx')
  async paymentsExcel(@Query() query: PaymentQueryDto) {
    // StreamableFile، نه Buffer خام: Nest یک Buffer برگشتی را JSON می‌کند و
    // فایل دانلودی باز نمی‌شود
    return xlsxFile(
      await this.reports.paymentsExcel(query),
      `sanpay-payments-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  @AdminAccess('bookings')
  @Get('bookings')
  bookings(@Query() query: BookingQueryDto) {
    return this.reports.bookings(query);
  }

  @AdminAccess('tourism-split')
  @Get('tourism-split')
  tourismSplitReport(@Query() query: TourismSplitQueryDto) {
    return this.tourismSplit.report(query);
  }

  @AdminAccess('tourism-split')
  @Get('tourism-split.xlsx')
  async tourismSplitExcel(@Query() query: TourismSplitQueryDto) {
    // StreamableFile، نه Buffer خام: Nest یک Buffer برگشتی را JSON می‌کند و
    // فایل دانلودی باز نمی‌شود
    return xlsxFile(
      await this.tourismSplit.excel(query),
      `sanpay-tourism-split-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  }

  @AdminAccess('flight-bookings')
  @Get('flight-bookings')
  flightBookings(@Query() query: FlightBookingQueryDto) {
    return this.reports.flightBookings(query);
  }
}

function xlsxFile(content: Buffer, filename: string): StreamableFile {
  return new StreamableFile(content, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    disposition: `attachment; filename="${filename}"`,
  });
}
