import {
  Body,
  Controller,
  Get,
  Header,
  Delete,
  Param,
  Patch,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, JwtPayload } from './auth.service';
import {
  LoginDto,
  RequestOtpDto,
  SetInitialPasswordDto,
  VerifyOtpDto,
} from './dto/login.dto';
import { ChangePasswordDto, UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { sessionInfo } from './session-info';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto.phone, dto.password, sessionInfo(request));
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.nationalCode, dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() request: Request) {
    return this.auth.verifyOtp(
      dto.nationalCode,
      dto.phone,
      dto.code,
      sessionInfo(request),
    );
  }

  @Post('set-initial-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  setInitialPassword(
    @Req() request: Request & { user: JwtPayload },
    @Body() dto: SetInitialPasswordDto,
  ) {
    return this.auth.setInitialPassword(request.user, dto.password);
  }

  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtAuthGuard)
  sessions(@Req() request: Request & { user: JwtPayload }) {
    return this.auth.sessions(request.user);
  }

  @Delete('sessions/others')
  @UseGuards(JwtAuthGuard)
  revokeOthers(@Req() request: Request & { user: JwtPayload }) {
    return this.auth.revokeOtherSessions(request.user);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @Req() request: Request & { user: JwtPayload },
    @Param('id') id: string,
  ) {
    return this.auth.revokeSession(request.user, id);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@Req() request: Request & { user: JwtPayload }) {
    return this.auth.revokeSession(request.user, request.user.sid);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: Request & { user: JwtPayload }) {
    return this.auth.profile(request.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req() request: Request & { user: JwtPayload },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updatePhone(request.user.sub, dto.phone);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  changePassword(
    @Req() request: Request & { user: JwtPayload },
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      request.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
