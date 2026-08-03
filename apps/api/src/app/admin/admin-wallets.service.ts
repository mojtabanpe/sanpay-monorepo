import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminWalletDefinitionRow,
  BulkAllocateResult,
  Paginated,
  WalletKind,
} from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkAllocateDto,
  CreateWalletDefinitionDto,
  ListQueryDto,
  UpdateWalletDefinitionDto,
} from './dto/admin.dto';

@Injectable()
export class AdminWalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQueryDto): Promise<Paginated<AdminWalletDefinitionRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();

    const where = {
      ...(query.active ? { isActive: query.active === 'true' } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [total, definitions] = await Promise.all([
      this.prisma.walletDefinition.count({ where }),
      this.prisma.walletDefinition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { stores: { include: { store: true } } },
      }),
    ]);

    const stats = await this.prisma.walletAllocation.groupBy({
      by: ['definitionId'],
      where: { definitionId: { in: definitions.map((d) => d.id) } },
      _count: { _all: true },
      _sum: { cap: true, spent: true },
    });
    const statByDefinition = new Map(stats.map((s) => [s.definitionId, s]));

    return {
      items: definitions.map((definition) => {
        const stat = statByDefinition.get(definition.id);
        return {
          id: definition.id,
          name: definition.name,
          kind: definition.kind as WalletKind,
          description: definition.description,
          icon: definition.icon,
          defaultCap:
            definition.defaultCap === null ? null : Number(definition.defaultCap),
          isActive: definition.isActive,
          createdAt: definition.createdAt.toISOString(),
          stores: definition.stores.map((link) => ({
            id: link.store.id,
            name: link.store.name,
            code: link.store.code,
          })),
          allocationCount: stat?._count._all ?? 0,
          allocatedAmount: Number(stat?._sum.cap ?? 0n),
          spentAmount: Number(stat?._sum.spent ?? 0n),
        };
      }),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateWalletDefinitionDto): Promise<AdminWalletDefinitionRow> {
    this.assertStoresAllowed(dto.kind, dto.storeIds);

    const definition = await this.prisma.walletDefinition.create({
      data: {
        name: dto.name,
        kind: dto.kind,
        description: dto.description || null,
        icon: dto.icon || null,
        defaultCap: dto.defaultCap === undefined ? null : BigInt(dto.defaultCap),
        stores: dto.storeIds?.length
          ? { create: dto.storeIds.map((storeId) => ({ storeId })) }
          : undefined,
      },
    });
    return this.one(definition.id);
  }

  async update(
    id: string,
    dto: UpdateWalletDefinitionDto,
  ): Promise<AdminWalletDefinitionRow> {
    const existing = await this.prisma.walletDefinition.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('کیف پول پیدا نشد');

    const kind = (dto.kind ?? existing.kind) as WalletKind;
    this.assertStoresAllowed(kind, dto.storeIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.walletDefinition.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description || null }
            : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon || null } : {}),
          ...(dto.defaultCap !== undefined
            ? { defaultCap: BigInt(dto.defaultCap) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      // فهرست فروشگاه‌ها جایگزینی است، نه افزایشی
      if (dto.storeIds) {
        await tx.walletDefinitionStore.deleteMany({ where: { definitionId: id } });
        if (dto.storeIds.length) {
          await tx.walletDefinitionStore.createMany({
            data: dto.storeIds.map((storeId) => ({ definitionId: id, storeId })),
          });
        }
      }
    });

    return this.one(id);
  }

  async one(id: string): Promise<AdminWalletDefinitionRow> {
    const { items } = await this.list({ pageSize: 200, page: 1 });
    const found = items.find((definition) => definition.id === id);
    if (!found) throw new NotFoundException('کیف پول پیدا نشد');
    return found;
  }

  /**
   * تخصیص گروهی: برای هر کارمند اگر تخصیص فعالی از این کیف پول داشته باشد
   * سقف/انقضای آن به‌روز می‌شود، وگرنه تخصیص تازه ساخته می‌شود.
   */
  async bulkAllocate(dto: BulkAllocateDto): Promise<BulkAllocateResult> {
    const definition = await this.prisma.walletDefinition.findUnique({
      where: { id: dto.definitionId },
    });
    if (!definition) throw new NotFoundException('کیف پول پیدا نشد');

    const employees = await this.prisma.employee.findMany({
      where: dto.employeeIds?.length
        ? { id: { in: dto.employeeIds } }
        : { isActive: true },
      select: { id: true },
    });

    const cap = BigInt(dto.cap);
    const expiresAt = new Date(dto.expiresAt);
    const result: BulkAllocateResult = { created: 0, updated: 0, skipped: 0 };

    for (const employee of employees) {
      const existing = await this.prisma.walletAllocation.findFirst({
        where: {
          employeeId: employee.id,
          definitionId: definition.id,
          isActive: true,
        },
      });

      if (!existing) {
        await this.prisma.walletAllocation.create({
          data: { employeeId: employee.id, definitionId: definition.id, cap, expiresAt },
        });
        result.created++;
        continue;
      }

      // سقف تازه نباید زیر خرج‌شده بیفتد — چنین کارمندی دست‌نخورده می‌ماند
      if (cap < existing.spent) {
        result.skipped++;
        continue;
      }
      await this.prisma.walletAllocation.update({
        where: { id: existing.id },
        data: { cap, expiresAt },
      });
      result.updated++;
    }

    return result;
  }

  /** کیف پول گردشگری فروشگاه ندارد — رزرو مستقیم روی هتل‌یار انجام می‌شود */
  private assertStoresAllowed(kind: WalletKind, storeIds?: string[]) {
    if (kind === 'TOURISM' && storeIds?.length) {
      throw new BadRequestException(
        'کیف پول گردشگری به فروشگاه وصل نمی‌شود',
      );
    }
  }
}
