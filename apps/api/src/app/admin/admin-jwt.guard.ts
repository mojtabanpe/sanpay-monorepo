import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AdminJwtPayload } from './admin-auth.service';
import { REQUIRED_ROLES } from './roles.decorator';

export type AdminRequest = Request & { admin: AdminJwtPayload };

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
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

    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length && !required.includes(payload.scope)) {
      throw new ForbiddenException('دسترسی لازم را ندارید');
    }

    (request as AdminRequest).admin = payload;
    return true;
  }
}
