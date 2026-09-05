import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminWalletDefinitionRow,
  BulkAllocateResult,
  Paginated,
  OrganizationalRank,
  WalletKind,
} from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';
import {
  BulkAllocateDto,
  CreateWalletDefinitionDto,
  ListQueryDto,
  UpdateWalletDefinitionDto,
} from './dto/admin.dto';

interface AllocationTarget {
  employeeId: string;
  cap: bigint;
  expiresAt: Date;
}

interface AllocationTargets {
  rows: AllocationTarget[];
  /** کد ملی‌هایی از فایل که کارمندی با آن‌ها ثبت نشده است */
  notFound: string[];
  rankMismatches: BulkAllocateResult['rankMismatches'];
}

@Injectable()
export class AdminWalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: ListQueryDto,
  ): Promise<Paginated<AdminWalletDefinitionRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();

    const where = {
      ...(query.active ? { isActive: query.active === 'true' } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [total, definitions] = await Promise.all([
      this.prisma.walletDefinition.count({ where }),
      this.prisma.walletDefinition.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { company: true, stores: { include: { store: true } } },
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
          company: { id: definition.company.id, name: definition.company.name },
          kind: definition.kind as WalletKind,
          description: definition.description,
          icon: definition.icon,
          defaultCap:
            definition.defaultCap === null
              ? null
              : Number(definition.defaultCap),
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

  async create(
    dto: CreateWalletDefinitionDto,
  ): Promise<AdminWalletDefinitionRow> {
    this.assertStoresAllowed(dto.kind, dto.storeIds);
    await this.mustHaveActiveCompany(dto.companyId);

    const definition = await this.prisma.walletDefinition.create({
      data: {
        name: dto.name,
        companyId: dto.companyId,
        kind: dto.kind,
        description: dto.description || null,
        icon: dto.icon || null,
        // خالی گذاشتن سقف پیش‌فرض یعنی نامحدود
        defaultCap:
          dto.defaultCap === undefined || dto.defaultCap === null
            ? null
            : BigInt(dto.defaultCap),
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
    if (dto.companyId) {
      await this.mustHaveActiveCompany(dto.companyId);
      const incompatibleAllocation =
        await this.prisma.walletAllocation.findFirst({
          where: {
            definitionId: id,
            employee: { companyId: { not: dto.companyId } },
          },
          select: { id: true },
        });
      if (incompatibleAllocation) {
        throw new BadRequestException(
          'تا زمانی که کیف‌پول به کارمندان شرکت قبلی تخصیص دارد، شرکت آن قابل تغییر نیست',
        );
      }
    }

    const kind = (dto.kind ?? existing.kind) as WalletKind;
    this.assertStoresAllowed(kind, dto.storeIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.walletDefinition.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.companyId !== undefined ? { companyId: dto.companyId } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description || null }
            : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon || null } : {}),
          // `null` صریح یعنی «نامحدود» و باید سقف قبلی را پاک کند
          ...(dto.defaultCap !== undefined
            ? {
                defaultCap:
                  dto.defaultCap === null ? null : BigInt(dto.defaultCap),
              }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      // فهرست فروشگاه‌ها جایگزینی است، نه افزایشی
      if (dto.storeIds) {
        await tx.walletDefinitionStore.deleteMany({
          where: { definitionId: id },
        });
        if (dto.storeIds.length) {
          await tx.walletDefinitionStore.createMany({
            data: dto.storeIds.map((storeId) => ({
              definitionId: id,
              storeId,
            })),
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
   *
   * دو حالت دارد:
   * - `entries` (از فایل اکسل/CSV): فقط به همان کد ملی‌ها، هرکدام با سقف و
   *   انقضای خودش. کد ملی‌ای که کارمندی نداشته باشد در `notFound` برمی‌گردد
   *   تا واحد رفاه بفهمد کدام سطرهای فایل اعمال نشده — نه این‌که بی‌صدا رد شود.
   * - بدون `entries`: سقف و انقضای یکسان برای همهٔ کارمندان فعال.
   */
  async bulkAllocate(dto: BulkAllocateDto): Promise<BulkAllocateResult> {
    const definition = await this.prisma.walletDefinition.findUnique({
      where: { id: dto.definitionId },
    });
    if (!definition) throw new NotFoundException('کیف پول پیدا نشد');

    const targets = dto.entries?.length
      ? await this.targetsFromEntries(dto.entries, definition.companyId)
      : await this.targetsFromUniformInput(dto, definition.companyId);

    const result: BulkAllocateResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      notFound: targets.notFound,
      rankMismatches: targets.rankMismatches,
    };

    for (const target of targets.rows) {
      const existing = await this.prisma.walletAllocation.findFirst({
        where: {
          employeeId: target.employeeId,
          definitionId: definition.id,
          isActive: true,
        },
      });

      if (!existing) {
        await this.prisma.walletAllocation.create({
          data: {
            employeeId: target.employeeId,
            definitionId: definition.id,
            cap: target.cap,
            expiresAt: target.expiresAt,
          },
        });
        result.created++;
        continue;
      }

      // سقف تازه نباید زیر خرج‌شده بیفتد — چنین کارمندی دست‌نخورده می‌ماند
      if (target.cap < existing.spent) {
        result.skipped++;
        continue;
      }
      await this.prisma.walletAllocation.update({
        where: { id: existing.id },
        data: { cap: target.cap, expiresAt: target.expiresAt },
      });
      result.updated++;
    }

    return result;
  }

  /** سطرهای فایل → کارمندان، با گزارش کد ملی‌های پیدانشده */
  private async targetsFromEntries(
    entries: NonNullable<BulkAllocateDto['entries']>,
    companyId: string,
  ): Promise<AllocationTargets> {
    const nationalCodes = entries.map((entry) => entry.nationalCode.trim());
    const employees = await this.prisma.employee.findMany({
      where: { nationalCode: { in: nationalCodes }, companyId },
      select: { id: true, nationalCode: true, organizationalRank: true },
    });
    const byNationalCode = new Map(
      employees.map((employee) => [employee.nationalCode, employee]),
    );

    const rows: AllocationTarget[] = [];
    const notFound: string[] = [];
    const rankMismatches: BulkAllocateResult['rankMismatches'] = [];
    for (const entry of entries) {
      const employee = byNationalCode.get(entry.nationalCode.trim());
      if (!employee) {
        notFound.push(entry.nationalCode.trim());
        continue;
      }
      if (employee.organizationalRank !== entry.organizationalRank) {
        rankMismatches.push({
          nationalCode: entry.nationalCode.trim(),
          fileRank: entry.organizationalRank as OrganizationalRank,
          employeeRank: employee.organizationalRank as OrganizationalRank,
        });
        continue;
      }
      rows.push({
        employeeId: employee.id,
        cap: BigInt(entry.cap),
        expiresAt: new Date(entry.expiresAt),
      });
    }
    return { rows, notFound, rankMismatches };
  }

  /** سقف و انقضای یکسان برای همهٔ کارمندان فعال (یا فهرست شناسه‌های داده‌شده) */
  private async targetsFromUniformInput(
    dto: BulkAllocateDto,
    companyId: string,
  ): Promise<AllocationTargets> {
    if (dto.cap === undefined || !dto.expiresAt) {
      throw new BadRequestException('سقف اعتبار و تاریخ انقضا لازم است');
    }
    const employees = await this.prisma.employee.findMany({
      where: dto.employeeIds?.length
        ? { id: { in: dto.employeeIds }, companyId }
        : { isActive: true, companyId },
      select: { id: true },
    });
    const cap = BigInt(dto.cap);
    const expiresAt = new Date(dto.expiresAt);
    return {
      rows: employees.map((employee) => ({
        employeeId: employee.id,
        cap,
        expiresAt,
      })),
      notFound: [],
      rankMismatches: [],
    };
  }

  private async mustHaveActiveCompany(id: string): Promise<void> {
    const company = await this.prisma.company.findFirst({
      where: { id, isActive: true },
      select: { id: true },
    });
    if (!company)
      throw new BadRequestException('شرکت معتبر و فعال انتخاب کنید');
  }

  /** کیف پول گردشگری فروشگاه ندارد — رزرو مستقیم روی هتل‌یار انجام می‌شود */
  private assertStoresAllowed(kind: WalletKind, storeIds?: string[]) {
    if (kind === 'TOURISM' && storeIds?.length) {
      throw new BadRequestException('کیف پول گردشگری به فروشگاه وصل نمی‌شود');
    }
  }
}
