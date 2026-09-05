import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

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
      if (!payload.nationalCode) {
        throw new UnauthorizedException();
      }
      if (
        payload.requiresPasswordSetup &&
        !request.url.includes('/auth/set-initial-password')
      ) {
        throw new UnauthorizedException('ابتدا رمز عبور خود را تعیین کنید');
      }
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
