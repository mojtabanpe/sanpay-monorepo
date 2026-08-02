import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/** توکن پنل فروشگاه — با `role` از توکن کارمند تفکیک می‌شود */
export interface StoreJwtPayload {
  sub: string;
  username: string;
  role: 'store';
}

@Injectable()
export class StoreAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const store = await this.prisma.store.findUnique({ where: { username } });
    if (!store || !store.isActive) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }

    const passwordOk = await bcrypt.compare(password, store.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('نام کاربری یا رمز عبور نادرست است');
    }

    const payload: StoreJwtPayload = {
      sub: store.id,
      username: store.username,
      role: 'store',
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      store: this.toProfile(store),
    };
  }

  async profile(storeId: string) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || !store.isActive) {
      throw new UnauthorizedException();
    }
    return this.toProfile(store);
  }

  private toProfile(store: {
    id: string;
    name: string;
    code: string;
    category: string | null;
  }) {
    return {
      id: store.id,
      name: store.name,
      /** کدی که در QR صندوق چاپ می‌شود */
      code: store.code,
      category: store.category,
    };
  }
}
