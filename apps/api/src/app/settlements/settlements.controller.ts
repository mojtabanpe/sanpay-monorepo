import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAccess } from '../admin/permissions.decorator';
import { AdminJwtGuard } from '../admin/admin-jwt.guard';
import { Roles, WRITE_ROLES } from '../admin/roles.decorator';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../admin/dto/admin.dto';
import { SettlementsService } from './settlements.service';

export class PreviewStoreSettlementDto {
  @IsUUID()
  storeId!: string;
}

export class RunStoreSettlementDto extends PreviewStoreSettlementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  previewToken!: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class SettlementItemQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn([
    'CREATED',
    'SUBMITTED',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
    'UNKNOWN',
  ])
  status?: string;

  @IsOptional()
  @IsIn(['STORE', 'HOTELYAR', 'EGHAMAT24'])
  beneficiaryType?: string;

  /** روز تقویمی به وقت تهران */
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @IsOptional()
  @Matches(DAY)
  to?: string;
}

@AdminAccess('settlements')
@Controller('admin/settlements')
@UseGuards(AdminJwtGuard)
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  list() {
    return this.settlements.list();
  }

  @Get('stores')
  stores() {
    return this.settlements.stores();
  }

  /** پیش از `:id` تا «items» شناسهٔ دسته حساب نشود */
  @Get('items')
  items(@Query() query: SettlementItemQueryDto) {
    return this.settlements.listItems(query);
  }

  @Post('preview')
  @Roles(...WRITE_ROLES)
  preview(@Body() input: PreviewStoreSettlementDto) {
    return this.settlements.previewStore(input.storeId);
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.settlements.one(id);
  }

  @Post('run')
  @Roles(...WRITE_ROLES)
  run(@Body() input: RunStoreSettlementDto) {
    return this.settlements.runManual(input.storeId, input.previewToken);
  }

  @Post(':id/reconcile')
  @Roles(...WRITE_ROLES)
  reconcile(@Param('id') id: string) {
    return this.settlements.reconcileBatch(id);
  }

  @Post('items/:id/retry')
  @Roles(...WRITE_ROLES)
  retry(@Param('id') id: string) {
    return this.settlements.retryFailedItem(id);
  }
}
