import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization ?? '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      // توکن پنل فروشگاه نباید مسیرهای کارمند را باز کند
      if (
        !payload.nationalCode ||
        typeof payload.sid !== 'string' ||
        !payload.sid
      ) {
        throw new UnauthorizedException();
      }
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: payload.sub,
          nationalCode: payload.nationalCode,
          isActive: true,
          deletedAt: null,
          company: { isActive: true },
          sessions: {
            some: {
              id: payload.sid,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          },
        },
        select: { id: true },
      });
      if (!employee) throw new UnauthorizedException();
      if (
        payload.requiresPasswordSetup &&
        !['/api/auth/set-initial-password', '/api/auth/logout'].includes(
          request.url.split('?')[0],
        )
      ) {
        throw new UnauthorizedException('ابتدا رمز عبور خود را تعیین کنید');
      }
      // آخرین فعالیت حداکثر یک‌بار در دقیقه نوشته می‌شود؛ ابطال در هر درخواست بررسی می‌شود.
      await this.prisma.employeeSession.updateMany({
        where: {
          id: payload.sid,
          employeeId: payload.sub,
          revokedAt: null,
          lastSeenAt: { lt: new Date(Date.now() - 60_000) },
        },
        data: { lastSeenAt: new Date() },
      });
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
