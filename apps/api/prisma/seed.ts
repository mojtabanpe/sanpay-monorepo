import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const employeePassword = await bcrypt.hash('12345678', 10);
  const storePassword = await bcrypt.hash('store1234', 10);

  // ─── کارمند نمونه ───────────────────────────────────────────────
  const employee = await prisma.employee.upsert({
    where: { nationalCode: '3060123456' },
    update: {},
    create: {
      nationalCode: '3060123456',
      personnelCode: '12345',
      firstName: 'علی',
      lastName: 'رضایی',
      phone: '09131234567',
      passwordHash: employeePassword,
    },
  });

  // ─── فروشگاه‌ها ─────────────────────────────────────────────────
  // `code` همان چیزی است که در QR ثابتِ صندوق کدگذاری می‌شود و کارمند می‌تواند
  // در حالت بدون دوربین دستی تایپش کند — بدون حروف مبهم (I/O/0/1).
  const storeSeed: Array<{
    username: string;
    code: string;
    name: string;
    category: string;
  }> = [
    { username: 'coop', code: 'COOP2385', name: 'تعاونی مصرف کارکنان', category: 'خواربار' },
    { username: 'pegah', code: 'PGAH7429', name: 'لبنیات پگاه سیرجان', category: 'لبنیات' },
    { username: 'ajil', code: 'AJIL5836', name: 'آجیل‌سرای مرکزی', category: 'آجیل و خشکبار' },
    { username: 'fruit', code: 'FRUT9264', name: 'میوه‌سرای سیرجان', category: 'میوه و تره‌بار' },
    { username: 'zagros', code: 'ZGRS4718', name: 'پروتئین زاگرس', category: 'گوشت و پروتئین' },
    { username: 'olympic', code: 'OLMP3652', name: 'ورزشی المپیک', category: 'لوازم ورزشی' },
    { username: 'iranmod', code: 'IRMD8473', name: 'پوشاک ایران‌مد', category: 'پوشاک' },
    { username: 'didgan', code: 'DDGN6195', name: 'عینک دیدگان', category: 'عینک' },
  ];

  const stores: Record<string, { id: string }> = {};
  for (const s of storeSeed) {
    stores[s.username] = await prisma.store.upsert({
      where: { username: s.username },
      update: { code: s.code },
      create: { ...s, passwordHash: storePassword },
    });
  }

  // ─── کیف‌پول‌ها + تخصیص به کارمند نمونه ─────────────────────────
  const walletSeed: Array<{
    name: string;
    icon: string;
    kind: 'CREDIT' | 'RATION' | 'TOURISM';
    cap: bigint;
    spent: bigint;
    expiresAt: Date;
    storeUsernames: string[];
  }> = [
    {
      name: 'ارزاق ماهانه',
      icon: 'food',
      kind: 'RATION',
      cap: 5_000_000n,
      spent: 1_800_000n,
      expiresAt: new Date('2026-08-22'), // ۱۴۰۵/۰۵/۳۱
      storeUsernames: ['coop', 'pegah'],
    },
    {
      name: 'خواربار و مواد غذایی',
      icon: 'grocery',
      kind: 'CREDIT',
      cap: 15_000_000n,
      spent: 5_200_000n,
      expiresAt: new Date('2026-09-22'), // ۱۴۰۵/۰۶/۳۱
      storeUsernames: ['ajil', 'fruit', 'zagros'],
    },
    {
      name: 'پوشاک و ورزش',
      icon: 'sport',
      kind: 'CREDIT',
      cap: 8_000_000n,
      spent: 0n,
      expiresAt: new Date('2027-03-20'), // ۱۴۰۵/۱۲/۲۹
      storeUsernames: ['olympic', 'iranmod'],
    },
    {
      // عمداً با «پوشاک و ورزش» در فروشگاه‌های مشترک هم‌پوشانی دارد تا حالت
      // شکستن مبلغ بین چند کیف پول قابل تست باشد.
      name: 'هدیه رفاهی',
      icon: 'gift',
      kind: 'CREDIT',
      cap: 2_000_000n,
      spent: 400_000n,
      expiresAt: new Date('2026-11-21'), // ۱۴۰۵/۰۸/۳۰
      storeUsernames: ['olympic', 'iranmod', 'didgan'],
    },
    {
      name: 'عینک و سلامت',
      icon: 'health',
      kind: 'CREDIT',
      cap: 3_000_000n,
      spent: 1_750_000n,
      expiresAt: new Date('2026-12-21'), // ۱۴۰۵/۰۹/۳۰
      storeUsernames: ['didgan'],
    },
    {
      // کیف پول گردشگری به هیچ فروشگاهی وصل نیست — فقط برای رزرو هتل از
      // طریق هتل‌یار خرج می‌شود، نه خرید حضوری با QR.
      name: 'اعتبار گردشگری',
      icon: 'travel',
      kind: 'TOURISM',
      cap: 40_000_000n,
      spent: 0n,
      expiresAt: new Date('2027-03-20'), // ۱۴۰۵/۱۲/۲۹
      storeUsernames: [],
    },
  ];

  for (const w of walletSeed) {
    let definition = await prisma.walletDefinition.findFirst({
      where: { name: w.name },
    });
    if (!definition) {
      definition = await prisma.walletDefinition.create({
        data: { name: w.name, icon: w.icon, kind: w.kind, defaultCap: w.cap },
      });
    } else {
      definition = await prisma.walletDefinition.update({
        where: { id: definition.id },
        data: { icon: w.icon, kind: w.kind },
      });
    }

    for (const username of w.storeUsernames) {
      await prisma.walletDefinitionStore.upsert({
        where: {
          definitionId_storeId: {
            definitionId: definition.id,
            storeId: stores[username].id,
          },
        },
        update: {},
        create: { definitionId: definition.id, storeId: stores[username].id },
      });
    }

    const existing = await prisma.walletAllocation.findFirst({
      where: { employeeId: employee.id, definitionId: definition.id },
    });
    if (!existing) {
      await prisma.walletAllocation.create({
        data: {
          employeeId: employee.id,
          definitionId: definition.id,
          cap: w.cap,
          spent: w.spent,
          expiresAt: w.expiresAt,
        },
      });
    }
  }

  console.log('Seed completed: employee 3060123456 / 12345678');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
