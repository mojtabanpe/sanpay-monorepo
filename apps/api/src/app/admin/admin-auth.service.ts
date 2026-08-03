import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminProfile, AdminRole } from '@sanpay/models';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * توکن داشبورد مدیریت.
 *
 * `role: 'admin'` آن را از توکن کارمند (که `nationalCode` دارد) و از توکن
 * فروشگاه (`role: 'store'`) جدا می‌کند، بنابراین JwtAuthGuard و StoreJwtGuard
 * هیچ‌کدام این توکن را نمی‌پذیرند.
 */
export interface AdminJwtPayload {
  sub: string;
  username: string;
  role: 'admin';
  /** سطح دسترسی — پایهٔ فقط-خواندنی بودن VIEWER */
  scope: AdminRole;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }
    if (!(await bcrypt.compare(password, admin.passwordHash))) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }

    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: AdminJwtPayload = {
      sub: admin.id,
      username: admin.username,
      role: 'admin',
      scope: admin.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      admin: toProfile(admin),
    };
  }

  async profile(adminId: string): Promise<AdminProfile> {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException();
    }
    return toProfile(admin);
  }

  async changePassword(
    adminId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException();
    }
    if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) {
      throw new BadRequestException('رمز عبور فعلی نادرست است');
    }
    if (await bcrypt.compare(newPassword, admin.passwordHash)) {
      throw new BadRequestException('رمز جدید نباید با رمز فعلی یکی باشد');
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });
    return { ok: true };
  }

  // ─── مدیریت کاربران داشبورد (فقط SUPER_ADMIN) ───────────────────────────

  async list(): Promise<AdminProfile[]> {
    const admins = await this.prisma.admin.findMany({
      orderBy: { createdAt: 'asc' },
    });
    return admins.map(toProfile);
  }

  async create(input: {
    username: string;
    name: string;
    password: string;
    role?: AdminRole;
  }): Promise<AdminProfile> {
    const taken = await this.prisma.admin.findUnique({
      where: { username: input.username },
    });
    if (taken) {
      throw new BadRequestException('این نام کاربری قبلاً ثبت شده است');
    }
    const admin = await this.prisma.admin.create({
      data: {
        username: input.username,
        name: input.name,
        role: input.role ?? 'ADMIN',
        passwordHash: await bcrypt.hash(input.password, 10),
      },
    });
    return toProfile(admin);
  }

  async update(
    id: string,
    input: { name?: string; role?: AdminRole; isActive?: boolean },
  ): Promise<AdminProfile> {
    const admin = await this.prisma.admin.update({ where: { id }, data: input });
    return toProfile(admin);
  }

  async resetPassword(id: string, password: string) {
    await this.prisma.admin.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }
}

function toProfile(admin: {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AdminProfile {
  return {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role as AdminRole,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
    createdAt: admin.createdAt.toISOString(),
  };
}
