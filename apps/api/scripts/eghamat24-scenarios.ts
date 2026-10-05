/**
 * سناریوی تستِ اقامت۲۴ (GRS Agency Manual v1.12.0، صفحهٔ ۱۴ تا ۲۱).
 *
 * اقامت۲۴ برای دادن توکن پروداکشن، کد رزروِ شش سناریو را روی هتل تست مشهد
 * (property_id = 1416) می‌خواهد. این اسکریپت هر شش رزرو را می‌فرستد و
 * `confirmation_code` هرکدام را چاپ می‌کند تا برای پشتیبانی فنی ارسال شود.
 *
 * فقط `POST /v1/reserve` اجرا می‌شود (نه book/cancel). تاریخ‌ها نسبت به امروز
 * ساخته می‌شوند چون نمونهٔ داکیومنت (۲۰۲۱) گذشته است.
 *
 *   pnpm nx run api:eghamat24-scenarios            # فقط نمایش بدنه‌ها (dry-run)
 *   pnpm nx run api:eghamat24-scenarios --send     # ارسال واقعی (فقط از شبکهٔ ایران)
 */
import 'dotenv/config';
import 'reflect-metadata';
import { GrsHttpClient } from '../src/app/tourism/providers/eghamat24/grs-http.client';
import {
  GrsReserveRequest,
  GrsReserveRoom,
} from '../src/app/tourism/providers/eghamat24/grs.types';

const PROPERTY_ID = 1416;
const RATE_PLAN_ID = 273;
const DOUBLE = 411102; // اتاق دو تخته
const SINGLE = 411840; // اتاق یک تخته
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
  guest_passport_number: '',
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
  rate_plan_id: RATE_PLAN_ID,
  count: 1,
  adult_count: adults,
  children,
  ...g,
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
    // سن‌های کودک: قانون children هتل ۲ تا ۵ سال است (max_infant_age=2، max_child_age=5)
    rooms: [room(DOUBLE, 3, [1, 3], guest('ستاره', 'ستاره'))],
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
      // پلن بدون محدودیت ملیت: country_id = null | پلن دارای محدودیت: فقط ۲۲۲
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
  // هر سناریو یک بازهٔ جدا (۳۰ روز بعد، با فاصله) تا موجودی هم‌دیگر را مصرف نکنند
  const base = Number(process.env.GRS_SCENARIO_DAYS_AHEAD ?? 30);
  const client = new GrsHttpClient();
  const rows: Record<string, string>[] = [];
  for (const [i, s] of scenarios.entries()) {
    const body = build(s, i, isoDay(base + i * 10));
    if (!send) {
      console.log(`\n# ${i + 1}. ${s.title}\n${JSON.stringify(body, null, 2)}`);
      continue;
    }
    try {
      const r = await client.reserve(body);
      rows.push({
        '#': String(i + 1),
        scenario: s.title,
        confirmation_code: r.confirmation_code,
        status: r.status,
        agency_code: body.agency_confirmation_code,
        dates: `${body.check_in} → ${body.check_out}`,
      });
    } catch (error) {
      rows.push({
        '#': String(i + 1),
        scenario: s.title,
        confirmation_code: '— ناموفق —',
        status: error instanceof Error ? error.message : 'error',
        agency_code: body.agency_confirmation_code,
        dates: `${body.check_in} → ${body.check_out}`,
      });
    }
  }
  if (send) console.table(rows);
  else console.log('\nDry-run: چیزی ارسال نشد. برای ارسال واقعی --send بزنید.');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'failed');
  process.exitCode = 1;
});
