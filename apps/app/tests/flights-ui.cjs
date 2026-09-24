const { chromium } = require('playwright');
const assert = require('node:assert/strict');
require('node:fs').mkdirSync('tmp/flights', { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('sanpay_token', 'ui-test-only');
    localStorage.setItem(
      'sanpay_profile',
      JSON.stringify({ firstName: 'کاربر', lastName: 'آزمایشی' }),
    );
  });
  let receipts = [];
  let search;
  let submits = 0;
  const leg = {
    key: 'test',
    origin: 'THR',
    destination: 'MHD',
    departureTime: '2090-01-01 08:30:00',
    arrivalTime: '2090-01-01 10:00:00',
    airline: 'IR',
    flightNumber: '۴۵۱',
    flightClass: 'economy',
    flightType: 'charter',
    baggage: 20,
    stops: 0,
    capacity: 5,
    foreign: false,
    cancellationRules: [],
  };
  const offer = {
    id: 'test',
    departure: leg,
    returning: null,
    amount: 1500000,
  };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data = [];
    if (path.endsWith('/airports'))
      data = [
        { iata: 'THR', name: 'تهران · مهرآباد' },
        { iata: 'MHD', name: 'مشهد · شهید هاشمی‌نژاد' },
      ];
    else if (path.endsWith('/search')) {
      search = route.request().postDataJSON();
      data = [
        {
          ...offer,
          departure: {
            ...leg,
            departureTime: search.departureDate + ' 08:30:00',
          },
        },
      ];
    } else if (path.endsWith('/quote'))
      data = {
        id: 'c177b991-0735-421b-a4e8-edff6e5d9a71',
        offer,
        search,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
        wallets: [
          {
            allocationId: '4f3e52b1-a2a0-4c72-9ec9-990fa5ba91ae',
            name: 'اعتبار گردشگری',
            max: 5000000,
            expiresAt: '2099-01-01',
            icon: null,
          },
        ],
      };
    else if (
      path.endsWith('/bookings') &&
      route.request().method() === 'POST'
    ) {
      submits++;
      data = {
        id: 'booking-test',
        offer,
        amount: 1500000,
        walletName: 'اعتبار گردشگری',
        status: 'CONFIRMED',
        confirmationCode: 'TEST123',
        createdAt: new Date().toISOString(),
        tickets: [
          {
            id: 1,
            number: 'TEST-TICKET',
            pnr: 'TEST-PNR',
            passengerName: 'Ali Ahmadi',
            direction: 'went',
          },
        ],
      };
      receipts = [data];
    } else if (path.endsWith('/bookings')) data = receipts;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  await page.goto('http://localhost:6200/tourism/flights');
  await page.getByRole('button', { name: 'تاریخ رفت', exact: true }).click();
  const calendarBounds = await page
    .locator('.cdk-overlay-pane:has([data-slot="calendar"])')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: innerWidth };
    });
  assert.ok(calendarBounds.left >= 0, 'calendar starts inside the viewport');
  assert.ok(
    calendarBounds.right <= calendarBounds.viewport,
    'calendar ends inside the viewport',
  );
  await page.keyboard.press('Escape');
  await page.getByLabel('مبدأ', { exact: true }).selectOption('THR');
  await page.getByLabel('مقصد', { exact: true }).selectOption('MHD');
  await page.getByText('رفت و برگشت', { exact: true }).click();
  await page
    .getByRole('button', { name: 'تاریخ برگشت', exact: true })
    .waitFor();
  await page.getByRole('radio', { name: 'یک‌طرفه', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.locator('summary').filter({ hasText: 'تعداد مسافران' }).click();
  assert.equal(
    await page.getByRole('button', { name: 'کاهش بزرگسال' }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'افزایش نوزاد' }).click();
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="افزایش نوزاد"]').disabled,
  );
  assert.equal(
    await page.getByRole('button', { name: 'افزایش نوزاد' }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'کاهش نوزاد' }).click();
  await page.getByRole('button', { name: 'افزایش کودک' }).click();
  await page.getByRole('button', { name: 'کاهش کودک' }).click();
  await page.locator('summary').filter({ hasText: 'تعداد مسافران' }).click();
  await page.getByRole('button', { name: 'جابه‌جایی مبدأ و مقصد' }).click();
  await page.waitForFunction(
    () => document.querySelector('#flight-origin').value === 'MHD',
  );
  assert.equal(
    await page.getByLabel('مبدأ', { exact: true }).inputValue(),
    'MHD',
  );
  await page.getByRole('button', { name: 'جابه‌جایی مبدأ و مقصد' }).click();
  await page
    .getByRole('button', { name: 'جست‌وجوی پرواز', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'انتخاب پرواز', exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'tmp/flights/search-mobile.png',
    fullPage: true,
  });
  for (const width of [320, 550, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.screenshot({
    path: 'tmp/flights/results-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('article').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/flights/result-card-mobile.png' });
  await page.getByRole('button', { name: 'انتخاب پرواز', exact: true }).click();
  await page.getByLabel('نام انگلیسی', { exact: true }).fill('Ali');
  await page.getByLabel('نام خانوادگی انگلیسی', { exact: true }).fill('Ahmadi');
  await page.getByLabel('تاریخ تولد (میلادی)', { exact: true }).click();
  await page.locator('[data-slot="calendar"] table button').first().click();
  await page.getByLabel('کد ملی', { exact: true }).fill('0492578631');
  await page.getByLabel('نام', { exact: true }).fill('علی');
  await page.getByLabel('نام خانوادگی', { exact: true }).fill('احمدی');
  await page.getByLabel('شماره همراه', { exact: true }).fill('09121234567');
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: 'tmp/flights/checkout-mobile.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: /پرداخت .* و رزرو/ }).click();
  await page.getByText('رزرو پرواز شما قطعی شد.').waitFor();
  assert.equal(submits, 1);
  assert.deepEqual(errors, []);
  await page.screenshot({
    path: 'tmp/flights/receipt-mobile.png',
    fullPage: true,
  });
  console.log(
    'Mobile search, passenger form, tourism-wallet checkout and receipt passed; no overflow or browser errors.',
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole('button', { name: 'بازگشت به جست‌وجو', exact: true })
    .click();
  await page.screenshot({
    path: 'tmp/flights/search-desktop.png',
    fullPage: true,
  });
  let finishSearch;
  await page.route('**/api/tourism/flights/search', async (route) => {
    await new Promise((resolve) => {
      finishSearch = resolve;
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page
    .getByRole('button', { name: 'جست‌وجوی پرواز', exact: true })
    .hover();
  await page
    .getByRole('button', { name: 'جست‌وجوی پرواز', exact: true })
    .click();
  await page.getByText('در حال بررسی پروازهای این مسیر…').waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'در حال جست‌وجو…' }).isDisabled(),
    true,
  );
  finishSearch();
  await page.getByText('پروازی برای این جست‌وجو پیدا نشد').waitFor();
  await page.unroute('**/api/tourism/flights/search');
  await page.unroute('**/api/**');
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'سرویس پرواز هنوز فعال نشده است؛ لطفاً بعداً مراجعه کنید',
      }),
    }),
  );
  await page.goto('http://localhost:6200/tourism/flights');
  await page.getByText('جست‌وجوی پرواز فعلاً در دسترس نیست').waitFor();
  assert.deepEqual(errors, []);
  console.log(
    'Unavailable-provider state passed. All API traffic was intercepted; no real booking was sent.',
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
