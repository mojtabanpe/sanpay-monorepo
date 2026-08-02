import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { StoreJwtPayload } from './store-auth.service';

@Injectable()
export class StoreJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization ?? '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwt.verifyAsync<StoreJwtPayload>(token);
      if (payload.role !== 'store') {
        throw new UnauthorizedException();
      }
      (request as Request & { store: StoreJwtPayload }).store = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
