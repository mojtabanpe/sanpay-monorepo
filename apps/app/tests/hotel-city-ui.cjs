const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  fs.mkdirSync('tmp/city-ui', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('sanpay_token', 'ui-test-only');
        localStorage.setItem('sanpay_profile', JSON.stringify({ firstName: 'کاربر', lastName: 'آزمایشی' }));
      });
      await page.route('**/api/**', (route) => route.fulfill({
        json: route.request().url().includes('/cities')
          ? [{ id: 'kish', name: 'کیش' }, { id: 'tehran', name: 'تهران' }, ...Array.from({ length: 30 }, (_, index) => ({ id: String(index), name: `شهر آزمایشی ${index}` }))]
          : [],
      }));
      await page.goto(`${process.env.CITY_TEST_URL || 'http://localhost:6200'}/tourism`);
      const trigger = page.locator('#hotel-city-trigger');
      await trigger.click();
      const popup = page.locator('[data-slot="combobox-content"]');
      await popup.waitFor();
      await popup.evaluate(async (element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      const bounds = await popup.boundingBox();
      const triggerBounds = await trigger.boundingBox();
      assert.equal(triggerBounds.height, 44);
      assert.ok(Math.abs(bounds.width - triggerBounds.width) < 2, 'popup matches trigger width');
      assert.ok(Math.abs(bounds.x - triggerBounds.x) < 2, 'popup aligns with trigger');
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, 'popup stays on screen');
      assert.notEqual(await popup.evaluate((element) => getComputedStyle(element).backdropFilter), 'none');
      assert.equal(await page.locator('hlm-combobox').evaluate((element) => getComputedStyle(element).borderTopWidth), '0px');
      const list = page.locator('[data-slot="combobox-list"]');
      assert.ok(await list.evaluate((element) => element.scrollHeight > element.clientHeight), 'long list scrolls');
      await page.screenshot({ path: `tmp/city-ui/open-${width}.png` });
      const search = page.getByLabel('جست‌وجوی شهر', { exact: true });
      await search.fill('كيش');
      await page.getByRole('option', { name: 'کیش', exact: true }).waitFor();
      assert.equal(await page.getByRole('option', { name: 'تهران', exact: true }).isVisible(), false);
      await search.press('ArrowDown');
      await search.press('Enter');
      await popup.waitFor({ state: 'hidden' });
      assert.match(await trigger.textContent(), /کیش/);
      await trigger.click();
      await search.fill('ناموجود');
      await page.getByText('شهری پیدا نشد', { exact: true }).waitFor();
      await popup.evaluate(async (element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      await page.screenshot({ path: `tmp/city-ui/empty-${width}.png` });
      await search.fill('');
      await page.getByRole('option', { name: 'همهٔ شهرها', exact: true }).click();
      await popup.waitFor({ state: 'hidden' });
      assert.match(await trigger.textContent(), /همهٔ شهرها/);
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`PASS ${width}px: layout, surface, scroll, Persian search, keyboard selection and empty state`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
