import 'dotenv/config';
import { stdin, stdout } from 'node:process';
import { createInterface, emitKeypressEvents } from 'node:readline';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../src/generated/prisma/client';

function askUsername(): Promise<string> {
  return new Promise((resolve) => {
    const terminal = createInterface({ input: stdin, output: stdout });
    terminal.question('نام کاربری سوپرادمین: ', (answer) => {
      terminal.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function askPassword(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let password = '';
    const wasRaw = stdin.isRaw;
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(label);

    const finish = () => {
      stdin.removeListener('keypress', onKeypress);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\n');
    };
    const onKeypress = (
      input: string,
      key?: { name?: string; ctrl?: boolean; meta?: boolean },
    ) => {
      if (key?.ctrl && key.name === 'c') {
        finish();
        reject(new Error('عملیات لغو شد.'));
      } else if (key?.name === 'return' || key?.name === 'enter') {
        finish();
        resolve(password);
      } else if (key?.name === 'backspace' || key?.name === 'delete') {
        password = password.slice(0, -1);
      } else if (
        input &&
        !key?.ctrl &&
        !key?.meta &&
        [...input].every((character) => {
          const code = character.codePointAt(0) ?? 0;
          return code > 31 && code !== 127;
        })
      ) {
        password += input;
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

async function main(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('این دستور باید در ترمینال تعاملی اجرا شود.');
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('متغیر DATABASE_URL تنظیم نشده است.');
  }

  const username = await askUsername();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new Error(
      'نام کاربری باید ۳ تا ۳۲ نویسهٔ انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.',
    );
  }

  const password = await askPassword('رمز عبور (نمایش داده نمی‌شود): ');
  if (password.length < 8) {
    throw new Error('رمز عبور باید حداقل ۸ نویسه باشد.');
  }
  const confirmation = await askPassword('تکرار رمز عبور: ');
  if (password !== confirmation) {
    throw new Error('رمز عبور و تکرار آن یکسان نیستند.');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      throw new Error(`نام کاربری «${username}» قبلاً ثبت شده است.`);
    }

    await prisma.admin.create({
      data: {
        username,
        name: username,
        role: 'SUPER_ADMIN',
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`سوپرادمین «${username}» ساخته شد.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'ساخت سوپرادمین ناموفق بود.',
  );
  process.exitCode = 1;
});
