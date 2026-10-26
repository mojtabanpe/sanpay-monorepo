import { Injectable } from '@nestjs/common';
import {
  AdminTourismSplitItem,
  AdminTourismSplitPerson,
  AdminTourismSplitReport,
} from '@sanpay/models';
import * as ExcelJS from 'exceljs';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TourismSplitQueryDto } from './dto/admin.dto';

/**
 * تفکیک پرداخت‌های گردشگری به اعتبار (بن) و کارت درگاه، به‌ازای هر شخص — برای
 * صدور فاکتور مودیان به نام شخص روی مابه‌التفاوتی که با کارت داده است.
 *
 * سهم کارت = خریدهایی که از کیف پول شخصی (`PERSONAL`) کسر شده؛ آن کیف پول فقط
 * با پول کارتی پر می‌شود. بازگشت وجه UPG اول سهم کارت را برمی‌گرداند.
 */
@Injectable()
export class AdminTourismSplitService {
  constructor(private readonly prisma: PrismaService) {}

  async report(query: TourismSplitQueryDto): Promise<AdminTourismSplitReport> {
    const q = query.q?.trim();
    const where: Prisma.PaymentIntentWhereInput = {
      purpose: query.kind ? query.kind : { in: ['HOTEL', 'FLIGHT'] },
      status: 'COMPLETED',
      ...(query.from || query.to
        ? {
            completedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            employee: {
              OR: [
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { nationalCode: { contains: q } },
                { personnelCode: { contains: q } },
              ],
            },
          }
        : {}),
    };

    const intents = await this.prisma.paymentIntent.findMany({
      where,
      orderBy: { completedAt: 'desc' },
      include: {
        employee: true,
        transactions: {
          where: { type: { in: ['PURCHASE', 'REFUND'] } },
          select: {
            type: true,
            amount: true,
            allocation: { select: { definition: { select: { kind: true } } } },
          },
        },
      },
    });

    const items: AdminTourismSplitItem[] = intents.map((intent) => {
      let card = 0;
      let cardRefunded = 0;
      let credit = 0;
      for (const row of intent.transactions) {
        const amount = Number(row.amount);
        const personal = row.allocation.definition.kind === 'PERSONAL';
        if (row.type === 'PURCHASE') {
          if (personal) card += amount;
          else credit += amount;
        } else if (personal) {
          cardRefunded += amount;
        } else {
          credit -= amount;
        }
      }
      return {
        intentId: intent.id,
        kind: intent.purpose as 'HOTEL' | 'FLIGHT',
        title: intent.title,
        employeeId: intent.employeeId,
        employeeName: `${intent.employee.firstName} ${intent.employee.lastName}`,
        nationalCode: intent.employee.nationalCode,
        total: Number(intent.amount),
        credit,
        card,
        cardRefunded,
        invoiceBase: card - cardRefunded,
        completedAt: (intent.completedAt ?? intent.createdAt).toISOString(),
      };
    });

    const byPerson = new Map<string, AdminTourismSplitPerson>();
    intents.forEach((intent, index) => {
      const item = items[index];
      const person = byPerson.get(intent.employeeId) ?? {
        employee: {
          id: intent.employeeId,
          name: item.employeeName,
          nationalCode: intent.employee.nationalCode,
          personnelCode: intent.employee.personnelCode,
        },
        count: 0,
        total: 0,
        credit: 0,
        card: 0,
        cardRefunded: 0,
        invoiceBase: 0,
      };
      person.count += 1;
      person.total += item.total;
      person.credit += item.credit;
      person.card += item.card;
      person.cardRefunded += item.cardRefunded;
      person.invoiceBase += item.invoiceBase;
      byPerson.set(intent.employeeId, person);
    });

    const persons = [...byPerson.values()].sort(
      (a, b) => b.invoiceBase - a.invoiceBase,
    );
    const totals = persons.reduce(
      (sum, person) => ({
        count: sum.count + person.count,
        total: sum.total + person.total,
        credit: sum.credit + person.credit,
        card: sum.card + person.card,
        cardRefunded: sum.cardRefunded + person.cardRefunded,
        invoiceBase: sum.invoiceBase + person.invoiceBase,
      }),
      { count: 0, total: 0, credit: 0, card: 0, cardRefunded: 0, invoiceBase: 0 },
    );
    return { persons, items, totals };
  }

  async excel(query: TourismSplitQueryDto): Promise<Buffer> {
    const { persons, items } = await this.report(query);
    const workbook = new ExcelJS.Workbook();

    const people = workbook.addWorksheet('به تفکیک شخص', {
      views: [{ rightToLeft: true }],
    });
    people.columns = [
      { header: 'کارمند', key: 'name', width: 24 },
      { header: 'کد ملی', key: 'nationalCode', width: 14 },
      { header: 'کد پرسنلی', key: 'personnelCode', width: 14 },
      { header: 'تعداد خرید', key: 'count', width: 12 },
      { header: 'جمع (ریال)', key: 'total', width: 18 },
      { header: 'اعتبار / بن (ریال)', key: 'credit', width: 18 },
      { header: 'کارت درگاه (ریال)', key: 'card', width: 18 },
      { header: 'بازگشتی به کارت (ریال)', key: 'cardRefunded', width: 20 },
      { header: 'مبنای فاکتور مودیان (ریال)', key: 'invoiceBase', width: 24 },
    ];
    for (const person of persons) {
      people.addRow({
        name: person.employee.name,
        nationalCode: person.employee.nationalCode,
        personnelCode: person.employee.personnelCode,
        count: person.count,
        total: person.total * 10,
        credit: person.credit * 10,
        card: person.card * 10,
        cardRefunded: person.cardRefunded * 10,
        invoiceBase: person.invoiceBase * 10,
      });
    }

    const detail = workbook.addWorksheet('ریز خریدها', {
      views: [{ rightToLeft: true }],
    });
    detail.columns = [
      { header: 'زمان', key: 'completedAt', width: 22 },
      { header: 'نوع', key: 'kind', width: 10 },
      { header: 'شرح', key: 'title', width: 32 },
      { header: 'کارمند', key: 'employeeName', width: 24 },
      { header: 'کد ملی', key: 'nationalCode', width: 14 },
      { header: 'جمع (ریال)', key: 'total', width: 18 },
      { header: 'اعتبار / بن (ریال)', key: 'credit', width: 18 },
      { header: 'کارت درگاه (ریال)', key: 'card', width: 18 },
      { header: 'بازگشتی به کارت (ریال)', key: 'cardRefunded', width: 20 },
      { header: 'مبنای فاکتور مودیان (ریال)', key: 'invoiceBase', width: 24 },
    ];
    for (const item of items) {
      detail.addRow({
        ...item,
        completedAt: new Date(item.completedAt),
        kind: item.kind === 'HOTEL' ? 'هتل' : 'پرواز',
        total: item.total * 10,
        credit: item.credit * 10,
        card: item.card * 10,
        cardRefunded: item.cardRefunded * 10,
        invoiceBase: item.invoiceBase * 10,
      });
    }
    detail.getColumn('completedAt').numFmt = 'yyyy-mm-dd hh:mm';

    for (const sheet of [people, detail]) {
      sheet.getRow(1).font = { bold: true };
      for (const key of ['total', 'credit', 'card', 'cardRefunded', 'invoiceBase']) {
        sheet.getColumn(key).numFmt = '#,##0';
      }
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
