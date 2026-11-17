// CI-only browser regression. Synthetic rides; all Supabase writes intercepted.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { sampleTrip } = require('./fixtures.cjs');
const url = process.env.RIDER_UI_URL || 'http://127.0.0.1:8789/';
const output = '/tmp/rider-journey-evidence';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const width of [320, 390, 768]) {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 761, hasTouch: true, timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
      const trip = sampleTrip(60);
      await ctx.addInitScript(trip => {
        if (!sessionStorage.getItem('journey-qa')) {
          localStorage.setItem('rs:trips:guest', JSON.stringify([trip]));
          sessionStorage.setItem('journey-qa', '1');
        }
      }, trip);
      await ctx.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname.endsWith('.supabase.co')) {
          if (u.pathname.includes('/auth/')) return route.fulfill({ status: 401, json: { message: 'QA guest' } });
          return route.fulfill({ json: [] });
        }
        return route.continue();
      });
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const entry = () => page.getByRole('button', { name: '내 성장과 오늘의 미션 보기', exact: true });
      const open = async () => { await entry().click(); await page.getByRole('heading', { name: '나의 라이더 여정', exact: true }).waitFor(); };
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await open();
      await page.waitForFunction(() => document.querySelectorAll('.rs-journey-day.is-recorded').length === 1);
      assert.equal(await page.locator('.rs-journey-counter').innerText(), '1 / 3');
      await page.getByRole('button', { name: '출발 전 30초 점검' }).click();
      await page.getByRole('button', { name: '나를 위한 쉬는 시간' }).click();
      assert.equal(await page.locator('.rs-journey-counter').innerText(), '3 / 3');
      await page.screenshot({ path: output + '/' + width + '-missions.png' });
      // A reload must not farm XP or erase today's checks.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await open();
      assert.equal(await page.locator('.rs-journey-counter').innerText(), '3 / 3');
      assert.equal(await page.locator('.rs-game-xp-head strong').innerText(), '40 / 100 XP');
      await page.locator('.rs-game-collection summary').click();
      assert.equal(await page.locator('.rs-game-achievement').count(), 5);
      await page.locator('.rs-game-collection summary').click();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, 'journey horizontal overflow at ' + width);
      await page.screenshot({ path: output + '/' + width + '-journey.png' });
      await page.getByRole('button', { name: '나의 경로, 다시 달려보기' }).click();
      await page.locator('.rs33-timeline').waitFor();
      const nav = page.locator(width < 761 ? '.bottom-nav' : '.desktop-nav');
      await nav.getByRole('button', { name: '지도', exact: true }).click();
      await entry().waitFor();
      await nav.getByRole('button', { name: '내 정보', exact: true }).click();
      await page.getByRole('button', { name: '오늘의 미션과 주간 기록 보기 ↗', exact: true }).click();
      await page.getByRole('heading', { name: '나의 라이더 여정', exact: true }).waitFor();
      const original = await page.evaluate(() => JSON.parse(localStorage.getItem('rs:trips:guest')));
      assert.deepEqual(original, [trip], 'journey must not mutate trip records');
      assert.deepEqual(errors, [], 'no page exceptions at ' + width);
      await ctx.close();
      console.log('PASS journey ' + width + ': completion, persistence, XP, badges, routes and immutable rides');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
