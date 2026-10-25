import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProfileService } from './profile.service';
import {
  AVATAR_MAX_BYTES,
  AvatarService,
  type UploadedImage,
} from '../avatars/avatar.service';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(
    private readonly profile: ProfileService,
    private readonly avatars: AvatarService,
  ) {}

  /** عکس پروفایل خود کارمند — فیلد multipart `file`، حداکثر ۲MB */
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  setAvatar(
    @Req() request: Request & { user: JwtPayload },
    @UploadedFile() file: UploadedImage,
  ) {
    return this.avatars.set(request.user.sub, file);
  }

  @Delete('avatar')
  removeAvatar(@Req() request: Request & { user: JwtPayload }) {
    return this.avatars.remove(request.user.sub);
  }

  @Get('summary')
  summary(@Req() request: Request & { user: JwtPayload }) {
    return this.profile.summary(request.user.sub);
  }

  @Get('wallet-transactions')
  walletTransactions(
    @Req() request: Request & { user: JwtPayload },
    @Query('cursor') cursor?: string,
  ) {
    return this.profile.walletTransactions(request.user.sub, cursor);
  }

  @Get('payments')
  payments(
    @Req() request: Request & { user: JwtPayload },
    @Query('limit') limit?: string,
  ) {
    return this.profile.payments(request.user.sub, Number(limit) || 30);
  }
}
