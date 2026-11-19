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
      // Synthetic trip belongs to this KST date even right after midnight.
      const currentKstDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const dayStart = Date.parse(currentKstDay + 'T00:00:00+09:00');
      const trip = sampleTrip(1, { started: Math.max(dayStart, Date.now() - 30000) });
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
      const nav = page.locator(width < 761 ? '.bottom-nav' : '.desktop-nav');
      const open = async () => {
        await nav.getByRole('button', { name: '내 바이크', exact: true }).click();
        await page.getByRole('button',{name:'프로필·설정',exact:true}).click();
        await page.locator('.rs-profile-page .rs-journey-panel').waitFor();
      };
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('.rs-journey-entry').count(), 0, 'Quest card must not appear on map');
      await open();
      assert.equal(await page.locator('.rs-profile-page .rs-game-profile').count(), 1, 'Progress is embedded in My Info');
      assert.equal(await page.locator('.rs-game-xp-head span').innerText(), 'XP',
        'minimal SIGNAL HUD renders the XP label instead of an explanatory sentence');
      await page.waitForFunction(() => document.querySelectorAll('.rs-journey-day.is-recorded').length === 1);
      assert.equal(await page.locator('.rs-journey-counter').innerText(), '1 / 3');
      assert.equal(await page.locator('.rs-rhythm').count(), 1, 'habit insight stays in My Info');
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
      await nav.getByRole('button', { name: '타임라인', exact: true }).click();
      assert.equal(await page.locator('.rs-journey-entry').count(), 0, 'No Quest strip after returning to the map');
      await open();
      const original = await page.evaluate(() => JSON.parse(localStorage.getItem('rs:trips:guest')));
      assert.deepEqual(original, [trip], 'journey must not mutate trip records');
      assert.deepEqual(errors, [], 'no page exceptions at ' + width);
      await ctx.close();
      console.log('PASS journey ' + width + ': completion, persistence, XP, badges, routes and immutable rides');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
