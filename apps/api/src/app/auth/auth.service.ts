import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

  private toProfile(employee: {
    id: string;
    nationalCode: string;
    personnelCode: string;
    firstName: string;
    lastName: string;
  }) {
    return {
      id: employee.id,
      nationalCode: employee.nationalCode,
      personnelCode: employee.personnelCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
    };
  }
}
