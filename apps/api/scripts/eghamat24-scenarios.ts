/**
 * سناریوی تستِ اقامت۲۴ (GRS Agency Manual v1.12.0، صفحهٔ ۱۴ تا ۲۱).
 *
 * اقامت۲۴ برای دادن توکن پروداکشن، کد رزروِ شش سناریو را روی هتل تست مشهد
 * (property_id = 2210) می‌خواهد. این اسکریپت هر شش رزرو را می‌فرستد و
 * `confirmation_code` هرکدام را چاپ می‌کند تا برای پشتیبانی فنی ارسال شود.
 *
 * `POST /v1/reserve` و سپس `POST /v1/book` اجرا می‌شوند. تاریخ‌ها نسبت به امروز
 * ساخته می‌شوند چون نمونهٔ داکیومنت (۲۰۲۱) گذشته است.
 *
 *   pnpm nx run api:eghamat24-scenarios            # فقط نمایش بدنه‌ها (dry-run)
 *   pnpm nx run api:eghamat24-scenarios --send     # ارسال واقعی (فقط از شبکهٔ ایران)
 */
import 'dotenv/config';
import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { scenariosTextCsv } from './eghamat24-scenario-csv';
import {
  GrsHttpClient,
  GrsRequestFailure,
} from '../src/app/tourism/providers/eghamat24/grs-http.client';
import {
  GrsReserveRequest,
  GrsReserveRoom,
} from '../src/app/tourism/providers/eghamat24/grs.types';

import {
  prepareScenarioRequest,
  TEST_DOUBLE_ROOM_ID,
  TEST_SINGLE_ROOM_ID,
} from './eghamat24-scenario-plan';

const PROPERTY_ID = 2210;
const RATE_PLAN_ID = 1780; // نمونهٔ dry-run؛ هنگام ارسال از API انتخاب می‌شود
const DOUBLE = TEST_DOUBLE_ROOM_ID; // اتاق دو تخته
const SINGLE = TEST_SINGLE_ROOM_ID; // اتاق یک تخته
const IRAN = 222;

function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

const guest = (
  first: string,
  last: string,
  countryId: number | null = IRAN,
): Pick<
  GrsReserveRoom,
  | 'guest_first_name'
  | 'guest_last_name'
  | 'guest_phone'
  | 'guest_email'
  | 'guest_national_code'
  | 'guest_passport_number'
  | 'guest_country_id'
  | 'guest_city_id'
> => ({
  guest_first_name: first,
  guest_last_name: last,
  guest_phone: '09379332830',
  guest_email: 'torabi@eghamat24.com',
  guest_national_code: '',
  guest_passport_number: countryId === IRAN ? '' : 'TEST987654',
  guest_country_id: countryId,
  guest_city_id: null,
});

const room = (
  roomTypeId: number,
  adults: number,
  children: number[],
  g: ReturnType<typeof guest>,
): GrsReserveRoom => ({
  room_type_id: roomTypeId,
  rate_plan_id: g.guest_country_id === IRAN ? RATE_PLAN_ID : 2653,
  count: 1,
  adult_count: adults,
  children,
  ...g,
  guests: Array.from({ length: adults + children.length }, (_, index) => ({
    first_name: index === 0 ? g.guest_first_name : `میهمان ${index + 1}`,
    last_name: g.guest_last_name,
    phone: g.guest_phone,
    email: g.guest_email,
    national_code: g.guest_national_code,
    passport_number: g.guest_passport_number,
    country_id: g.guest_country_id,
    city_id: g.guest_city_id,
  })),
});

interface Scenario {
  title: string;
  nights: number;
  rooms: GrsReserveRoom[];
}

const scenarios: Scenario[] = [
  {
    title: 'درخواست اتاق دو تخته',
    nights: 7,
    rooms: [room(DOUBLE, 2, [], guest('ستاره', 'ستاره'))],
  },
  {
    title: 'درخواست اتاق دو تخته با نفر اضافه',
    nights: 7,
    // adult_count = کل نفرات (ظرفیت اصلی + نفر اضافه)
    rooms: [room(DOUBLE, 3, [], guest('ستاره', 'ستاره'))],
  },
  {
    title: 'درخواست اتاق دو تخته به همراه نیم‌بها',
    nights: 7,
    // دو بزرگسال و یک کودک نیم‌بها؛ نفر اضافه در سناریوی ۲ بررسی می‌شود.
    rooms: [room(DOUBLE, 2, [3], guest('ستاره', 'ستاره'))],
  },
  {
    title: 'رزرو دو اتاق یک تخته در یک رزرو',
    nights: 1,
    rooms: [
      room(SINGLE, 1, [], guest('تست', 'تست')),
      room(SINGLE, 1, [], guest('تست', 'تست')),
    ],
  },
  {
    title: 'رزرو یک اتاق یک تخته و یک دو تخته در یک درخواست',
    nights: 1,
    rooms: [
      room(SINGLE, 1, [], guest('تست', 'تست')),
      room(DOUBLE, 1, [], guest('مشهد', 'مشهد')),
    ],
  },
  {
    title: 'رزرو با مهمان خارجی و ایرانی',
    nights: 1,
    rooms: [
      // میهمان خارجی همراه پاسپورت تست؛ پلن مناسب از کاتالوگ انتخاب می‌شود.
      room(SINGLE, 1, [], guest('تست', 'تست', null)),
      room(SINGLE, 1, [], guest('تست', 'تست', IRAN)),
    ],
  },
];

function build(s: Scenario, index: number, checkIn: string): GrsReserveRequest {
  const d = new Date(`${checkIn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + s.nights);
  return {
    property_id: PROPERTY_ID,
    check_in: checkIn,
    check_out: d.toISOString().slice(0, 10),
    booker_first_name: 'تست',
    booker_last_name: 'تست',
    booker_phone: '09379332830',
    booker_email: 'torabi@eghamat24.com',
    // کد پیگیری یکتا برای هر اجرا، تا رزرو در پنل اقامت۲۴ پیدا شود
    agency_confirmation_code: `SANPAY-T${index + 1}-${Date.now()}`,
    description: null,
    rooms: s.rooms,
  };
}

async function main() {
  const send = process.argv.includes('--send');
  // بازه‌های نزدیک، تا از افق نرخ‌دهی هتل تست خارج نشویم؛ موجودی پیش از ارسال بررسی می‌شود.
  const base = Number(process.env.GRS_SCENARIO_DAYS_AHEAD ?? 1);
  const spacing = Number(process.env.GRS_SCENARIO_SPACING_DAYS ?? 1);
  if (
    !Number.isSafeInteger(base) ||
    base < 1 ||
    !Number.isSafeInteger(spacing) ||
    spacing < 1
  )
    throw new Error('فاصله تاریخ‌های سناریو باید عدد صحیح مثبت باشد');
  const selected = process.argv
    .find((arg) => arg.startsWith('--scenario='))
    ?.split('=')[1];
  if (selected !== undefined && !/^[1-6]$/.test(selected))
    throw new Error('--scenario باید عددی بین ۱ و ۶ باشد');
  const check = process.argv.includes('--check');
  const client = new GrsHttpClient();
  const rows: Record<string, string>[] = [];
  for (const [i, s] of scenarios.entries()) {
    if (selected && Number(selected) !== i + 1) continue;
    let body = build(s, i, isoDay(base + i * spacing));
    if (!send && !check) {
      console.log(`\n# ${i + 1}. ${s.title}\n${JSON.stringify(body, null, 2)}`);
      continue;
    }
    try {
      body = await prepareScenarioRequest(client, body);
      if (check) {
        rows.push({
          '#': String(i + 1),
          scenario: s.title,
          status: 'آماده ارسال',
          rooms: body.rooms
            .map((room) => `${room.room_type_id}/${room.rate_plan_id}`)
            .join(', '),
          dates: `${body.check_in} → ${body.check_out}`,
        });
        continue;
      }
      const reserved = await client.reserve(body);
      const result: Record<string, string> = {
        '#': String(i + 1),
        scenario: s.title,
        confirmation_code: reserved.confirmation_code,
        status: reserved.status,
        agency_code: body.agency_confirmation_code,
        dates: `${body.check_in} → ${body.check_out}`,
      };
      rows.push(result);
      if (
        reserved.status !== 'booking' &&
        reserved.status !== 'booked' &&
        reserved.status !== 'definite'
      ) {
        process.exitCode = 1;
        result.status = `رزرو آماده Book نیست: ${reserved.status}`;
      }
      if (reserved.status === 'booking') {
        try {
          const booked = await client.book(reserved.confirmation_code);
          result.status = booked.status;
          if (booked.status !== 'booked' && booked.status !== 'definite')
            throw new Error(`وضعیت نهایی پس از Book: ${booked.status}`);
        } catch (error) {
          // A timed-out write may already have succeeded; reconcile without repeating Book.
          const current = await client
            .reserveDetails(reserved.confirmation_code)
            .catch(() => null);
          if (current?.status === 'booked' || current?.status === 'definite') {
            result.status = current.status;
            continue;
          }
          process.exitCode = 1;
          result.status = `Book ناموفق: ${error instanceof Error ? error.message : 'error'}`;
        }
      }
    } catch (error) {
      process.exitCode = 1;
      rows.push({
        '#': String(i + 1),
        scenario: s.title,
        confirmation_code: '— ناموفق —',
        status:
          error instanceof GrsRequestFailure
            ? `${error.message} (${error.diagnostic})`
            : error instanceof Error
              ? error.message
              : 'error',
        agency_code: body.agency_confirmation_code,
        dates: `${body.check_in} → ${body.check_out}`,
      });
    }
  }
  if (send || check) {
    console.table(rows);
    const csvPath = process.argv
      .find((arg) => arg.startsWith('--csv='))
      ?.slice('--csv='.length);
    if (csvPath) {
      await writeFile(csvPath, scenariosTextCsv(rows), 'utf8');
      console.log(`CSV: ${csvPath}`);
    }
  } else
    console.log('\nDry-run: چیزی ارسال نشد. برای ارسال واقعی --send بزنید.');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'failed');
  process.exitCode = 1;
});
