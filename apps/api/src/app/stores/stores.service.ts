import { Injectable } from '@nestjs/common';
import { EmployeeStore } from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * فروشگاه‌هایی که این کارمند با کیف‌پول‌های فعالش می‌تواند از آن‌ها خرید کند.
   * مبنا همان قاعدهٔ checkout است: تخصیص فعال، منقضی‌نشده و با ماندهٔ مثبت.
   * فروشگاهی که هیچ کیف پول قابل خرجی ندارد اصلاً برنمی‌گردد.
   */
  async forEmployee(
    employeeId: string,
    allocationId?: string,
  ): Promise<EmployeeStore[]> {
    const allocations = await this.prisma.walletAllocation.findMany({
      where: {
        ...(allocationId ? { id: allocationId } : {}),
        employeeId,
        isActive: true,
        expiresAt: { gt: new Date() },
        definition: { isActive: true },
      },
      include: {
        definition: { include: { stores: { include: { store: true } } } },
      },
      orderBy: { expiresAt: 'asc' },
    });

    const byStore = new Map<string, EmployeeStore>();

    for (const allocation of allocations) {
      const remaining = Number(allocation.cap - allocation.spent);
      if (remaining <= 0) continue;

      for (const link of allocation.definition.stores) {
        const store = link.store;
        if (!store.isActive) continue;

        let entry = byStore.get(store.id);
        if (!entry) {
          entry = {
            id: store.id,
            code: store.code,
            name: store.name,
            category: store.category,
            address: store.address,
            phone: store.phone,
            wallets: [],
            totalAvailable: 0,
          };
          byStore.set(store.id, entry);
        }

        entry.wallets.push({
          allocationId: allocation.id,
          name: allocation.definition.name,
          icon: allocation.definition.icon,
          remaining,
        });
        entry.totalAvailable += remaining;
      }
    }

    return [...byStore.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'fa'),
    );
  }
}
