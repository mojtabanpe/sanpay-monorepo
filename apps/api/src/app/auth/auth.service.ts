import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EmployeeProfile } from '@sanpay/models';
import * as bcrypt from 'bcrypt';
import { createHmac, randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';

export interface JwtPayload {
  sub: string;
  nationalCode: string;
  authMethod: 'OTP' | 'PASSWORD';
  requiresPasswordSetup: boolean;
}

const OTP_EXPIRY_SECONDS = 120;
const OTP_RESEND_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sms: SmsService,
  ) {}

  async login(nationalCode: string, password: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { nationalCode },
      include: { company: true },
    });
    if (!employee || !employee.isActive || !employee.company.isActive) {
      throw new UnauthorizedException('کد ملی یا رمز عبور نادرست است');
    }

    if (!employee.passwordHash) {
      throw new BadRequestException(
        'ابتدا با کد یک‌بارمصرف وارد شوید و برای خودتان رمز تعیین کنید',
      );
    }

    const passwordOk = await bcrypt.compare(password, employee.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('کد ملی یا رمز عبور نادرست است');
    }

    const payload: JwtPayload = {
      sub: employee.id,
      nationalCode: employee.nationalCode,
      authMethod: 'PASSWORD',
      requiresPasswordSetup: false,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      employee: this.toProfile(employee),
      requiresPasswordSetup: false,
    };
  }

  async requestOtp(nationalCode: string, phone: string) {
    const result = {
      sent: true,
      expiresInSeconds: OTP_EXPIRY_SECONDS,
      retryAfterSeconds: OTP_RESEND_SECONDS,
    };
    const employee = await this.prisma.employee.findFirst({
      where: {
        nationalCode,
        phone,
        isActive: true,
        company: { isActive: true },
      },
      include: { otp: true },
    });

    // پاسخ عمدی یکسان است تا از روی API نتوان عضویت افراد را تشخیص داد.
    if (!employee) {
      this.logger.debug(
        'OTP skipped: no active employee/company matching the supplied credentials',
      );
      return result;
    }

    if (
      employee.otp &&
      employee.otp.sentAt.getTime() + OTP_RESEND_SECONDS * 1000 > Date.now()
    ) {
      this.logger.debug('OTP skipped: the 60-second resend cooldown is active');
      return {
        ...result,
        sent: false,
        message: 'همان کد قبلی هنوز معتبر است؛ می‌توانید آن را وارد کنید',
      };
    }

    const code = String(randomInt(100_000, 1_000_000));
    await this.sms.sendOtp(phone, code);
    const now = new Date();
    await this.prisma.employeeOtp.upsert({
      where: { employeeId: employee.id },
      create: {
        employeeId: employee.id,
        codeHash: this.hashOtp(employee.id, code),
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_SECONDS * 1000),
        sentAt: now,
      },
      update: {
        codeHash: this.hashOtp(employee.id, code),
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_SECONDS * 1000),
        attempts: 0,
        sentAt: now,
      },
    });
    return result;
  }

  async verifyOtp(nationalCode: string, phone: string, code: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        nationalCode,
        phone,
        isActive: true,
        company: { isActive: true },
      },
      include: { company: true, otp: true },
    });
    const otp = employee?.otp;
    if (
      !employee ||
      !otp ||
      otp.expiresAt <= new Date() ||
      otp.attempts >= MAX_OTP_ATTEMPTS
    ) {
      throw new UnauthorizedException('کد نامعتبر یا منقضی شده است');
    }

    if (otp.codeHash !== this.hashOtp(employee.id, code)) {
      await this.prisma.employeeOtp.update({
        where: { employeeId: employee.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException('کد نامعتبر یا منقضی شده است');
    }

    await this.prisma.employeeOtp.delete({
      where: { employeeId: employee.id },
    });
    const payload: JwtPayload = {
      sub: employee.id,
      nationalCode: employee.nationalCode,
      authMethod: 'OTP',
      requiresPasswordSetup: !employee.passwordHash,
    };
    return {
      accessToken: await this.jwt.signAsync(payload),
      employee: this.toProfile(employee),
      requiresPasswordSetup: !employee.passwordHash,
    };
  }

  async setInitialPassword(payload: JwtPayload, password: string) {
    if (payload.authMethod !== 'OTP') {
      throw new UnauthorizedException(
        'برای تعیین رمز اولیه با کد یک‌بارمصرف وارد شوید',
      );
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.sub },
      select: { passwordHash: true, isActive: true },
    });
    if (!employee?.isActive) throw new UnauthorizedException();
    if (employee.passwordHash) {
      throw new BadRequestException('رمز عبور قبلاً تعیین شده است');
    }
    await this.prisma.employee.update({
      where: { id: payload.sub },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }

  async profile(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true },
    });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException();
    }
    return this.toProfile(employee);
  }

  /** به‌روزرسانی اطلاعات تماس — کارمند فقط شمارهٔ موبایل خودش را می‌تواند عوض کند */
  async updatePhone(employeeId: string, phone: string | undefined) {
    const employee = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { phone: phone ? phone : null },
      include: { company: true },
    });
    return this.toProfile(employee);
  }

  /** تغییر رمز عبور — رمز فعلی باید درست باشد و رمز جدید متفاوت */
  async changePassword(
    employeeId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException();
    }
    if (!employee.passwordHash) {
      throw new BadRequestException(
        'ابتدا با کد یک‌بارمصرف رمز خود را تعیین کنید',
      );
    }
    if (!(await bcrypt.compare(currentPassword, employee.passwordHash))) {
      throw new BadRequestException('رمز عبور فعلی نادرست است');
    }
    if (await bcrypt.compare(newPassword, employee.passwordHash)) {
      throw new BadRequestException('رمز جدید نباید با رمز فعلی یکی باشد');
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { ok: true };
  }

  private hashOtp(employeeId: string, code: string): string {
    const secret = process.env.OTP_SECRET || process.env.JWT_SECRET;
    if (!secret) throw new Error('OTP_SECRET or JWT_SECRET must be configured');
    return createHmac('sha256', secret)
      .update(`${employeeId}:${code}`)
      .digest('hex');
  }

  private toProfile(employee: {
    id: string;
    nationalCode: string;
    personnelCode: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    organizationalRank: 'MANAGER' | 'DEPUTY' | 'HEAD' | 'EMPLOYEE';
    company: { id: string; name: string };
  }): EmployeeProfile {
    return {
      id: employee.id,
      nationalCode: employee.nationalCode,
      personnelCode: employee.personnelCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      phone: employee.phone,
      company: { id: employee.company.id, name: employee.company.name },
      organizationalRank: employee.organizationalRank,
    };
  }
}
