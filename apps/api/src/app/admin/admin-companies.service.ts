import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminCompanyRow, Paginated } from '@sanpay/models';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCompanyDto,
  ListQueryDto,
  UpdateCompanyDto,
} from './dto/admin.dto';

@Injectable()
export class AdminCompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListQueryDto): Promise<Paginated<AdminCompanyRow>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();
    const where = {
      ...(query.active ? { isActive: query.active === 'true' } : {}),
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [total, companies] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { employees: true, walletDefinitions: true } },
        },
      }),
    ]);

    return {
      items: companies.map(toRow),
      total,
      page,
      pageSize,
    };
  }

  async create(dto: CreateCompanyDto): Promise<AdminCompanyRow> {
    const name = dto.name.trim();
    const existing = await this.prisma.company.findUnique({ where: { name } });
    if (existing) throw new BadRequestException('این شرکت قبلاً ثبت شده است');

    const company = await this.prisma.company.create({
      data: { name },
      include: {
        _count: { select: { employees: true, walletDefinitions: true } },
      },
    });
    return toRow(company);
  }

  async update(id: string, dto: UpdateCompanyDto): Promise<AdminCompanyRow> {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('شرکت پیدا نشد');

    if (dto.name !== undefined) {
      const nameClash = await this.prisma.company.findFirst({
        where: { name: dto.name.trim(), id: { not: id } },
      });
      if (nameClash) throw new BadRequestException('این نام شرکت تکراری است');
    }

    const company = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        _count: { select: { employees: true, walletDefinitions: true } },
      },
    });
    return toRow(company);
  }
}

function toRow(company: {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  _count: { employees: number; walletDefinitions: number };
}): AdminCompanyRow {
  return {
    id: company.id,
    name: company.name,
    isActive: company.isActive,
    createdAt: company.createdAt.toISOString(),
    employeeCount: company._count.employees,
    walletCount: company._count.walletDefinitions,
  };
}
