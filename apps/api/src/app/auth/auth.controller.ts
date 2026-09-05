import {
  Body,
  Controller,
  Get,
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.nationalCode, dto.password);
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.nationalCode, dto.phone);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.nationalCode, dto.phone, dto.code);
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
