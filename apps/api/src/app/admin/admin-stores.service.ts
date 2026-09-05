import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminStoreRow, Paginated } from '@sanpay/models';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto, ListQueryDto, UpdateStoreDto } from './dto/admin.dto';

/** بدون حروف مبهم (I/O/0/1) چون کد فروشگاه دستی هم تایپ می‌شود */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class AdminStoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQueryDto): Promise<Paginated<AdminStoreRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();

    const where = {
      ...(query.active ? { isActive: query.active === 'true' } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { code: { contains: q, mode: 'insensitive' as const } },
              { username: { contains: q, mode: 'insensitive' as const } },
              { category: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, stores] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { walletDefinitions: true, payments: true } },
        },
      }),
    ]);

    // جمع فروش هر فروشگاه در یک کوئری گروهی، نه N کوئری
    const sums = await this.prisma.payment.groupBy({
      by: ['storeId'],
      where: { storeId: { in: stores.map((s) => s.id) } },
      _sum: { amount: true },
    });
    const amountByStore = new Map(
      sums.map((s) => [s.storeId, Number(s._sum.amount ?? 0n)]),
    );

    return {
      items: stores.map((store) => ({
        id: store.id,
        name: store.name,
        code: store.code,
        category: store.category,
        phone: store.phone,
        address: store.address,
        settlementIban: store.settlementIban,
        settlementOwnerName: store.settlementOwnerName,
        username: store.username,
        isActive: store.isActive,
        createdAt: store.createdAt.toISOString(),
        walletCount: store._count.walletDefinitions,
        paymentCount: store._count.payments,
        totalAmount: amountByStore.get(store.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateStoreDto): Promise<AdminStoreRow> {
    const taken = await this.prisma.store.findFirst({
      where: {
        OR: [{ username: dto.username }, ...(dto.code ? [{ code: dto.code }] : [])],
      },
    });
    if (taken) {
      throw new BadRequestException('نام کاربری یا کد فروشگاه تکراری است');
    }

    const store = await this.prisma.store.create({
      data: {
        name: dto.name,
        code: dto.code ?? (await this.uniqueCode()),
        category: dto.category || null,
        phone: dto.phone || null,
        address: dto.address || null,
        settlementIban: dto.settlementIban,
        settlementOwnerName: dto.settlementOwnerName || null,
        username: dto.username,
        passwordHash: await bcrypt.hash(dto.password, 10),
      },
    });
    return this.one(store.id);
  }

  async update(id: string, dto: UpdateStoreDto): Promise<AdminStoreRow> {
    await this.mustExist(id);
    await this.prisma.store.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.category !== undefined ? { category: dto.category || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address || null } : {}),
        ...(dto.settlementIban !== undefined
          ? { settlementIban: dto.settlementIban }
          : {}),
        ...(dto.settlementOwnerName !== undefined
          ? { settlementOwnerName: dto.settlementOwnerName || null }
          : {}),
      },
    });
    return this.one(id);
  }

  async resetPassword(id: string, password: string) {
    await this.mustExist(id);
    await this.prisma.store.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }

  async one(id: string): Promise<AdminStoreRow> {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: { _count: { select: { walletDefinitions: true, payments: true } } },
    });
    if (!store) throw new NotFoundException('فروشگاه پیدا نشد');
    const sum = await this.prisma.payment.aggregate({
      where: { storeId: id },
      _sum: { amount: true },
    });
    return {
      id: store.id,
      name: store.name,
      code: store.code,
      category: store.category,
      phone: store.phone,
      address: store.address,
      settlementIban: store.settlementIban,
      settlementOwnerName: store.settlementOwnerName,
      username: store.username,
      isActive: store.isActive,
      createdAt: store.createdAt.toISOString(),
      walletCount: store._count.walletDefinitions,
      paymentCount: store._count.payments,
      totalAmount: Number(sum._sum.amount ?? 0n),
    };
  }

  private async mustExist(id: string) {
    const store = await this.prisma.store.findUnique({ where: { id } });
    if (!store) throw new NotFoundException('فروشگاه پیدا نشد');
    return store;
  }

  /** کد ۸ نویسه‌ای یکتا برای QR صندوق */
  private async uniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = Array.from(
        { length: 8 },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
      ).join('');
      const clash = await this.prisma.store.findUnique({ where: { code } });
      if (!clash) return code;
    }
    throw new BadRequestException('ساخت کد یکتا ممکن نشد — کد را دستی وارد کنید');
  }
}
