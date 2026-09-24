const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  fs.mkdirSync('tmp/splash', { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {}),
  });
  const base = process.env.SPLASH_TEST_URL || 'http://localhost:6200';
  const html = fs.readFileSync('apps/app/src/index.html', 'utf8');
  async function preview(options = {}) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    await page.route('**/splash-preview', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    );
    return { context, page };
  }
  const ready = (page) =>
    page.evaluate(() => document.dispatchEvent(new Event('sanpay:ready')));
  try {
    for (const width of [390, 1280]) {
      const { context, page } = await preview({
        viewport: { width, height: 844 },
      });
      await page.goto(`${base}/splash-preview`);
      await page.waitForFunction(
        () => document.querySelector('video').currentTime > 2.1,
      );
      assert.equal(await page.locator('video').evaluate((v) => v.muted), true);
      assert.ok(
        (await page.locator('app-root').getAttribute('inert')) !== null,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({ path: `tmp/splash/splash-${width}.png` });
      // Slow bootstrap keeps the splash present even after the film finishes.
      await page.waitForFunction(
        () =>
          document.querySelector('video').ended ||
          !document
            .querySelector('#sanpay-splash')
            .hasAttribute('data-animated'),
      );
      assert.equal(await page.locator('#sanpay-splash').isVisible(), true);
      await page.waitForTimeout(700);
      assert.equal(await page.locator('#sanpay-splash').getAttribute('data-animated'), 'true');
      assert.ok(await page.locator('video').evaluate((v) => v.currentTime > 2.5));
      await ready(page);
      await page.locator('#sanpay-splash').waitFor({ state: 'detached' });
      assert.equal(await page.locator('app-root').getAttribute('inert'), null);
      // Refresh starts a new animation and never exposes the static poster.
      await page.goto(`${base}/splash-preview`);
      await page.waitForFunction(() => document.querySelector('video').currentTime > 0.2);
      assert.equal(await page.locator('#sanpay-splash img').isVisible(), false);
      await ready(page);
      await page.locator('#sanpay-splash').waitFor({ state: 'detached' });
      await context.close();
      console.log(
        `PASS ${width}px: video, mute, slow bootstrap, exit and refresh playback and final-frame hold`,
      );
    }
    {
      const { context, page } = await preview({ reducedMotion: 'reduce' });
      let mediaRequests = 0;
      page.on('request', (request) => {
        if (request.url().endsWith('.mp4')) mediaRequests++;
      });
      await page.goto(`${base}/splash-preview`);
      assert.equal(await page.locator('video').getAttribute('src'), null);
      await ready(page);
      await page.locator('#sanpay-splash').waitFor({ state: 'detached' });
      assert.equal(mediaRequests, 0);
      await context.close();
      console.log('PASS reduced motion: static poster, no video download');
    }
    {
      const { context, page } = await preview();
      await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = () =>
          Promise.reject(new Error('autoplay disabled'));
      });
      await page.goto(`${base}/splash-preview`);
      await page.waitForFunction(
        () =>
          !document
            .querySelector('#sanpay-splash')
            .hasAttribute('data-animated'),
      );
      await page.evaluate(() =>
        document.dispatchEvent(new Event('sanpay:failed')),
      );
      await page
        .getByText('بارگذاری اپ انجام نشد. دوباره تلاش کنید.')
        .waitFor();
      assert.equal(
        await page.getByRole('link', { name: 'تلاش دوباره' }).isVisible(),
        true,
      );
      await ready(page);
      await page.locator('#sanpay-splash').waitFor({ state: 'detached' });
      await context.close();
      console.log('PASS blocked autoplay, bootstrap failure and recovery');
    }
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${base}/login`);
      await page
        .locator('#sanpay-splash')
        .waitFor({ state: 'detached', timeout: 10000 });
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.sanpayBoot),
        'ready',
      );
      assert.equal(await page.locator('app-root').getAttribute('inert'), null);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(
        'PASS real Angular initial navigation dismisses splash without browser errors',
      );
    }
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/splash.js', (route) => route.abort());
      await page.goto(`${base}/login`);
      await page
        .locator('#sanpay-splash')
        .waitFor({ state: 'detached', timeout: 10000 });
      assert.equal(await page.locator('app-root').getAttribute('inert'), null);
      await context.close();
      console.log(
        'PASS splash script unavailable: loaded app remains accessible',
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
