import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WalletView {
  id: string;
  name: string;
  icon: string | null;
  /** سقف اعتبار (تومان) */
  cap: number;
  /** ماندهٔ اعتبار (تومان) */
  remaining: number;
  expiresAt: string;
  stores: string[];
}

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  /** کیف‌پول‌های فعال کارمند به‌همراه فروشگاه‌های قابل استفاده */
  async forEmployee(employeeId: string): Promise<WalletView[]> {
    const allocations = await this.prisma.walletAllocation.findMany({
      where: {
        employeeId,
        isActive: true,
        definition: { isActive: true },
      },
      include: {
        definition: {
          include: { stores: { include: { store: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return allocations.map((allocation) => ({
      id: allocation.id,
      name: allocation.definition.name,
      icon: allocation.definition.icon,
      cap: Number(allocation.cap),
      remaining: Number(allocation.cap - allocation.spent),
      expiresAt: allocation.expiresAt.toISOString(),
      stores: allocation.definition.stores
        .filter((link) => link.store.isActive)
        .map((link) => link.store.name),
    }));
  }
}
