import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EmployeeProfile } from '@sanpay/models';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  nationalCode: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(nationalCode: string, password: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { nationalCode },
    });
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('کد ملی یا رمز عبور نادرست است');
    }

    const passwordOk = await bcrypt.compare(password, employee.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('کد ملی یا رمز عبور نادرست است');
    }

    const payload: JwtPayload = {
      sub: employee.id,
      nationalCode: employee.nationalCode,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      employee: this.toProfile(employee),
    };
  }

  async profile(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
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

  private toProfile(employee: {
    id: string;
    nationalCode: string;
    personnelCode: string;
    firstName: string;
    lastName: string;
    phone: string | null;
  }): EmployeeProfile {
    return {
      id: employee.id,
      nationalCode: employee.nationalCode,
      personnelCode: employee.personnelCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      phone: employee.phone,
    };
  }
}
