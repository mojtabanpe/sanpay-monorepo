import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AdminPermission,
  AdminResource,
  hasAdminPermission,
} from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';
import {
  ADMIN_RESOURCE,
  ADMIN_REQUIRED_PERMISSIONS,
} from './permissions.decorator';
import { Request } from 'express';
import { AdminJwtPayload } from './admin-auth.service';
import { REQUIRED_ROLES } from './roles.decorator';

export type AdminRequest = Request & { admin: AdminJwtPayload };

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization ?? '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    let payload: AdminJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminJwtPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    // توکن کارمند یا فروشگاه نباید داشبورد را باز کند
    if (payload.role !== 'admin') {
      throw new UnauthorizedException();
    }

    // Use current database grants: old JWTs cannot retain revoked permissions or roles.
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
    });
    if (!admin?.isActive) throw new UnauthorizedException();
    payload.scope = admin.role;

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length && !required.includes(payload.scope)) {
      throw new ForbiddenException('دسترسی لازم را ندارید');
    }

    const targets = [context.getHandler(), context.getClass()];
    const alternatives = this.reflector.getAllAndOverride<
      AdminPermission[] | undefined
    >(ADMIN_REQUIRED_PERMISSIONS, targets);
    const resource = this.reflector.getAllAndOverride<
      AdminResource | undefined
    >(ADMIN_RESOURCE, targets);
    const permissions =
      alternatives ??
      (resource
        ? [
            `${resource}:${['GET', 'HEAD'].includes(request.method) ? 'read' : 'write'}` as AdminPermission,
          ]
        : []);
    const profile = {
      role: admin.role,
      permissions: admin.permissions as AdminPermission[],
    };
    if (
      permissions.length &&
      !permissions.some((permission) => hasAdminPermission(profile, permission))
    ) {
      throw new ForbiddenException('دسترسی لازم را ندارید');
    }

    (request as AdminRequest).admin = payload;
    return true;
  }
}
