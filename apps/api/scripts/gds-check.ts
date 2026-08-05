/**
 * چک اتصال به هتل‌یار (WorldGDS) با اعتبارنامه‌های .env
 *
 *   npm run gds:check
 *
 * خطاهای هتل‌یار با HTTP 200 و `status: false` برمی‌گردند، پس این اسکریپت هم
 * مثل GdsHttpClient به `status` نگاه می‌کند نه به کد وضعیت HTTP. هدف فقط
 * تأیید کلید/کاربر/شبکه است؛ هیچ رزروی انجام نمی‌شود.
 */
import 'dotenv/config';

const baseUrl = (process.env.GDS_URL ?? 'https://apidemo.worldgds.com').replace(
  /\/+$/,
  '',
);
const apiKey = process.env.GDS_API_KEY ?? '';
const user = process.env.GDS_USERNAME ?? '';
const password = process.env.GDS_PASSWORD ?? '';

async function post<T>(method: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/${method}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      APIKEY: apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${method}: HTTP ${response.status}`);
  }
  const envelope = (await response.json()) as {
    status: boolean;
    errorCode: number;
    description: string;
    response: T;
  };
  if (!envelope.status) {
    throw new Error(
      `${method}: خطای ${envelope.errorCode} — ${envelope.description}`,
    );
  }
  return envelope.response;
}

async function main() {
  if (!apiKey || !user || !password) {
    throw new Error('GDS_API_KEY / GDS_USERNAME / GDS_PASSWORD در .env نیست');
  }
  console.log(`آدرس: ${baseUrl}\nکاربر: ${user}\n`);

  const login = await post<{ sessionId: string; expiredTime?: string }>(
    'login',
    { user, password },
  );
  console.log(`✓ login — سشن تا ${login.expiredTime ?? 'یک ساعت'}`);

  const cities = await post<{ id: string; description: string }[]>('getCity', {
    sessionId: login.sessionId,
    countryId: 1,
    lang: 2,
  });
  console.log(`✓ getCity — ${cities.length} شهر`);

  const firstCity = cities[0];
  if (!firstCity) {
    console.log('هیچ شهری برنگشت؛ ادامهٔ چک ممکن نیست');
    return;
  }
  const hotels = await post<{ id: string; description: string }[]>('getHotel', {
    sessionId: login.sessionId,
    cityId: Number(firstCity.id),
    lang: 2,
  });
  console.log(
    `✓ getHotel — ${hotels.length} هتل در ${firstCity.description}` +
      (hotels[0] ? ` (مثلاً ${hotels[0].description})` : ''),
  );

  // جست‌وجوی فردا برای یک شب، فقط برای اطمینان از دسترسی به قیمت‌ها
  const checkin = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const results = await post<unknown[]>('searchHotel', {
    sessionId: login.sessionId,
    checkin,
    nights: 1,
    hotelId: -1,
    cityId: Number(firstCity.id),
    rate: -1,
    capacityId: -1,
    capacity: -1,
    person: 1,
    lang: 2,
    isForeigner: 0,
    detail: 1,
    commission: 0,
  });
  console.log(`✓ searchHotel (${checkin}) — ${results.length} نتیجه`);
  console.log('\nاتصال به هتل‌یار سالم است.');
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
