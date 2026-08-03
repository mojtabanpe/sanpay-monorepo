import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminAllocationRow,
  AdminEmployeeDetail,
  AdminEmployeeRow,
  AdminPaymentRow,
  Paginated,
  WalletKind,
} from '@sanpay/models';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAllocationDto,
  CreateEmployeeDto,
  ListQueryDto,
  UpdateAllocationDto,
  UpdateEmployeeDto,
} from './dto/admin.dto';
import { toPaymentRow } from './payment-row';

@Injectable()
export class AdminEmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQueryDto): Promise<Paginated<AdminEmployeeRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const q = query.q?.trim();

    const where = {
      ...(query.active ? { isActive: query.active === 'true' } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' as const } },
              { lastName: { contains: q, mode: 'insensitive' as const } },
              { nationalCode: { contains: q } },
              { personnelCode: { contains: q } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };

    const [total, employees] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { allocations: { where: activeAllocation() } },
      }),
    ]);

    return {
      items: employees.map((employee) => toRow(employee)),
      total,
      page,
      pageSize,
    };
  }

  async detail(id: string): Promise<AdminEmployeeDetail> {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        allocations: {
          include: { definition: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!employee) throw new NotFoundException('کارمند پیدا نشد');

    const payments = await this.prisma.payment.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        store: true,
        employee: true,
        transactions: { include: { allocation: { include: { definition: true } } } },
      },
    });

    const totals = await this.prisma.payment.aggregate({
      where: { employeeId: id },
      _sum: { amount: true },
    });

    const allocations: AdminAllocationRow[] = employee.allocations.map((a) => ({
      id: a.id,
      definitionId: a.definitionId,
      definitionName: a.definition.name,
      kind: a.definition.kind as WalletKind,
      icon: a.definition.icon,
      cap: Number(a.cap),
      spent: Number(a.spent),
      remaining: Number(a.cap - a.spent),
      expiresAt: a.expiresAt.toISOString(),
      isActive: a.isActive,
      createdAt: a.createdAt.toISOString(),
    }));

    const active = employee.allocations.filter(
      (a) => a.isActive && a.expiresAt > new Date(),
    );

    return {
      ...toRow({ ...employee, allocations: active }),
      allocations,
      payments: payments.map(toPaymentRow) as AdminPaymentRow[],
      totalSpent: Number(totals._sum.amount ?? 0n),
    };
  }

  async create(dto: CreateEmployeeDto): Promise<AdminEmployeeRow> {
    const clash = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { nationalCode: dto.nationalCode },
          { personnelCode: dto.personnelCode },
        ],
      },
    });
    if (clash) {
      throw new BadRequestException('کد ملی یا کد پرسنلی تکراری است');
    }

    // رمز اولیه اگر داده نشود کد ملی است — کارمند در اولین ورود عوضش می‌کند
    const employee = await this.prisma.employee.create({
      data: {
        nationalCode: dto.nationalCode,
        personnelCode: dto.personnelCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone || null,
        passwordHash: await bcrypt.hash(dto.password || dto.nationalCode, 10),
      },
    });
    return toRow({ ...employee, allocations: [] });
  }

  async update(id: string, dto: UpdateEmployeeDto): Promise<AdminEmployeeRow> {
    await this.mustExist(id);
    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.phone !== undefined ? { phone: dto.phone || null } : {}),
      },
      include: { allocations: { where: activeAllocation() } },
    });
    return toRow(employee);
  }

  async resetPassword(id: string, password: string) {
    await this.mustExist(id);
    await this.prisma.employee.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10) },
    });
    return { ok: true };
  }

  // ─── تخصیص کیف پول ──────────────────────────────────────────────────────

  async addAllocation(employeeId: string, dto: CreateAllocationDto) {
    await this.mustExist(employeeId);
    const definition = await this.prisma.walletDefinition.findUnique({
      where: { id: dto.definitionId },
    });
    if (!definition) throw new NotFoundException('کیف پول پیدا نشد');

    const allocation = await this.prisma.walletAllocation.create({
      data: {
        employeeId,
        definitionId: dto.definitionId,
        cap: BigInt(dto.cap),
        expiresAt: new Date(dto.expiresAt),
      },
      include: { definition: true },
    });
    return toAllocationRow(allocation);
  }

  async updateAllocation(id: string, dto: UpdateAllocationDto) {
    const existing = await this.prisma.walletAllocation.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('تخصیص پیدا نشد');
    // سقف نباید زیر مبلغ خرج‌شده برود، وگرنه مانده منفی می‌شود
    if (dto.cap !== undefined && BigInt(dto.cap) < existing.spent) {
      throw new BadRequestException(
        'سقف نمی‌تواند کمتر از مبلغ مصرف‌شده باشد',
      );
    }

    const allocation = await this.prisma.walletAllocation.update({
      where: { id },
      data: {
        ...(dto.cap !== undefined ? { cap: BigInt(dto.cap) } : {}),
        ...(dto.expiresAt ? { expiresAt: new Date(dto.expiresAt) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { definition: true },
    });
    return toAllocationRow(allocation);
  }

  /**
   * اصلاح دستی مانده: مبلغ مثبت مانده را زیاد می‌کند (کاهش spent) و منفی کم.
   * برای ردیابی، یک Transaction از نوع ADJUSTMENT هم ثبت می‌شود.
   */
  async adjustAllocation(id: string, amount: number, note: string) {
    if (amount === 0) throw new BadRequestException('مبلغ نمی‌تواند صفر باشد');

    return this.prisma.$transaction(async (tx) => {
      const allocation = await tx.walletAllocation.findUnique({ where: { id } });
      if (!allocation) throw new NotFoundException('تخصیص پیدا نشد');

      const delta = BigInt(-amount); // افزایش مانده = کاهش spent
      const spent = allocation.spent + delta;
      if (spent < 0n || spent > allocation.cap) {
        throw new BadRequestException('مبلغ اصلاح خارج از محدودهٔ این کیف پول است');
      }

      const updated = await tx.walletAllocation.update({
        where: { id },
        data: { spent },
        include: { definition: true },
      });

      await tx.transaction.create({
        data: {
          type: amount > 0 ? 'REFUND' : 'ADJUSTMENT',
          amount: BigInt(Math.abs(amount)),
          employeeId: allocation.employeeId,
          allocationId: allocation.id,
          note,
        },
      });

      return toAllocationRow(updated);
    });
  }

  private async mustExist(id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('کارمند پیدا نشد');
    return employee;
  }
}

function activeAllocation() {
  return { isActive: true, expiresAt: { gt: new Date() } };
}

function toRow(employee: {
  id: string;
  nationalCode: string;
  personnelCode: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
  allocations: Array<{ cap: bigint; spent: bigint }>;
}): AdminEmployeeRow {
  return {
    id: employee.id,
    nationalCode: employee.nationalCode,
    personnelCode: employee.personnelCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    phone: employee.phone,
    isActive: employee.isActive,
    createdAt: employee.createdAt.toISOString(),
    walletCount: employee.allocations.length,
    remaining: employee.allocations.reduce(
      (sum, a) => sum + Number(a.cap - a.spent),
      0,
    ),
  };
}

export function toAllocationRow(allocation: {
  id: string;
  definitionId: string;
  cap: bigint;
  spent: bigint;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  definition: { name: string; kind: string; icon: string | null };
}): AdminAllocationRow {
  return {
    id: allocation.id,
    definitionId: allocation.definitionId,
    definitionName: allocation.definition.name,
    kind: allocation.definition.kind as WalletKind,
    icon: allocation.definition.icon,
    cap: Number(allocation.cap),
    spent: Number(allocation.spent),
    remaining: Number(allocation.cap - allocation.spent),
    expiresAt: allocation.expiresAt.toISOString(),
    isActive: allocation.isActive,
    createdAt: allocation.createdAt.toISOString(),
  };
}
