/**
 * چک اتصال به اقامت۲۴ / GRS با اعتبارنامه‌های .env
 *
 *   pnpm grs:check
 *
 * دو کار می‌کند و هر دو لازم‌اند:
 *
 * ۱. **تأیید توکن و شبکه.** میزبان تست (`hotel-test-01.denv.ir`) فقط از داخل
 *    ایران باز است، پس این اسکریپت باید از یک شبکهٔ ایرانی اجرا شود.
 * ۲. **تأیید مسیرها.** از مسیرهای GRS فقط `/v1/cities` و `POST /v1/book` عیناً
 *    در داکیومنت آمده‌اند؛ بقیه از روی نام سرویس نوشته شده‌اند. برای همین این
 *    اسکریپت با اولین شکست متوقف **نمی‌شود** و برای هر ۴۰۴ چند املای جایگزین
 *    را هم امتحان می‌کند — یک بار اجرا باید همهٔ مسیرها را قطعی کند تا نتیجه
 *    در `ENDPOINTS` داخل `grs-http.client.ts` نوشته شود.
 *
 * هیچ رزروی ثبت نمی‌شود؛ فقط سرویس‌های خواندنی صدا زده می‌شوند.
 */
import 'dotenv/config';

const baseUrl = `${(process.env.GRS_URL ?? '').replace(/\/+$/, '')}/v1`;
const token = process.env.GRS_TOKEN ?? '';

/** املاهای جایگزین برای مسیرهایی که در داکیومنت تأیید نشده‌اند */
const ALTERNATIVES: Record<string, string[]> = {
  properties: ['property', 'hotels', 'accommodations'],
  'available-rooms': ['available_rooms', 'availableRooms', 'rooms/available'],
  suggestion: ['suggestions', 'search'],
};

interface Result {
  path: string;
  status: number;
  ok: boolean;
  count: number | null;
  message: string;
  value: unknown;
}

async function call(
  path: string,
  query: Record<string, string | number | null> = {},
): Promise<Result> {
  const url = new URL(`${baseUrl}/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Client-Token': token,
    },
    signal: AbortSignal.timeout(20_000),
  });

  const raw = await response.text();
  let envelope: {
    code?: number;
    message?: string;
    errors?: { name: string; message: string }[] | null;
    error?: { name: string; message: string }[] | null;
    value?: unknown;
  } | null = null;
  try {
    envelope = JSON.parse(raw);
  } catch {
    envelope = null;
  }

  // خطای منطقی (مثل موجودی) با HTTP 200 و فقط داخل errors[] می‌آید
  const errors = [...(envelope?.errors ?? []), ...(envelope?.error ?? [])];
  const value = envelope?.value ?? null;

  return {
    path,
    status: response.status,
    ok: response.ok && errors.length === 0 && envelope !== null,
    count: Array.isArray(value) ? value.length : null,
    message:
      errors.map((error) => `${error.name}: ${error.message}`).join('، ') ||
      envelope?.message ||
      (envelope === null ? `پاسخ غیر JSON — ${raw.slice(0, 120)}` : ''),
    value,
  };
}

/** خلاصهٔ اجرا — تعیین می‌کند پیام پایانی چه باشد */
const outcome = { ok: 0, notFound: 0, unreachable: 0, other: 0 };

/** یک سرویس را صدا می‌زند و در صورت ۴۰۴ املاهای جایگزین را هم امتحان می‌کند */
async function probe(
  label: string,
  path: string,
  query: Record<string, string | number | null> = {},
): Promise<Result | null> {
  let result: Result;
  try {
    result = await call(path, query);
  } catch (error) {
    outcome.unreachable++;
    console.log(`✗ ${label} (${path}) — ${message(error)}`);
    return null;
  }

  if (result.ok) {
    outcome.ok++;
    const size = result.count === null ? '' : ` — ${result.count} مورد`;
    console.log(`✓ ${label} (/v1/${path})${size}`);
    return result;
  }

  // ۵xx و پاسخ غیر JSON یعنی اصلاً به سرویس نرسیده‌ایم (میزبان تست فقط از
  // داخل ایران باز است)؛ این با «مسیر اشتباه است» یکی نیست و نباید یکی
  // گزارش شود.
  if (result.status >= 500) {
    outcome.unreachable++;
  } else if (result.status === 404) {
    outcome.notFound++;
  } else {
    outcome.other++;
  }

  console.log(
    `✗ ${label} (/v1/${path}) — HTTP ${result.status}${result.message ? ` — ${result.message}` : ''}`,
  );

  if (result.status !== 404) {
    return null;
  }

  for (const alternative of ALTERNATIVES[path] ?? []) {
    try {
      const retry = await call(alternative, query);
      if (retry.ok) {
        console.log(
          `  ↳ ولی /v1/${alternative} جواب داد — همین را در ENDPOINTS بگذارید`,
        );
        return retry;
      }
    } catch {
      // جایگزینِ نشدنی مهم نیست؛ فقط حدس بود
    }
  }
  return null;
}

async function main() {
  if (!process.env.GRS_URL || !token) {
    throw new Error('GRS_URL / GRS_TOKEN در .env نیست');
  }
  console.log(
    `آدرس: ${baseUrl}\nتوکن: ${token.slice(0, 10)}… (${token.length} کاراکتر)\n`,
  );

  const cities = await probe('cities', 'cities');
  const city = firstId(cities?.value);

  const properties = await probe('properties', 'properties', { city_id: city });
  const property = firstId(properties?.value);

  if (property !== null) {
    await probe('property details', `properties/${property}`);
  }

  // فردا برای یک شب — فقط برای اطمینان از دسترسی به نرخ و موجودی
  const checkIn = isoDate(1);
  const checkOut = isoDate(2);

  if (property !== null) {
    await probe('available rooms', 'available-rooms', {
      property_id: property,
      check_in: checkIn,
      check_out: checkOut,
    });
  }

  await probe('suggestion', 'suggestion', {
    city_id: city,
    check_in: checkIn,
    check_out: checkOut,
    adults_count: 1,
  });

  console.log('');

  if (outcome.unreachable > 0 && outcome.ok === 0) {
    console.log(
      'به سرویس نرسیدیم. میزبان تست فقط از داخل ایران باز است — این اسکریپت را از یک شبکهٔ ایرانی اجرا کنید.',
    );
    process.exitCode = 1;
    return;
  }
  if (outcome.other > 0 && outcome.ok === 0) {
    console.log(
      'سرویس پاسخ داد ولی درخواست‌ها را نپذیرفت — اول از همه GRS_TOKEN را چک کنید (۴۰۳ یعنی توکن).',
    );
    process.exitCode = 1;
    return;
  }
  if (outcome.notFound > 0) {
    console.log(
      `${outcome.notFound} مسیر ۴۰۴ گرفت — همان‌ها را در ENDPOINTS داخل grs-http.client.ts اصلاح کنید.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log('اتصال به اقامت۲۴ سالم است و همهٔ مسیرها جواب دادند.');
}

function firstId(value: unknown): number | null {
  const first = Array.isArray(value) ? value[0] : null;
  const id = (first as { id?: unknown } | null)?.id;
  return typeof id === 'number' ? id : Number(id) || null;
}

function isoDate(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${message(error)}`);
  process.exitCode = 1;
});
