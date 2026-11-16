const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const ORIGIN = "https://rider-spot.jazzhjm.workers.dev/";
const when = (stamp) => Date.parse(stamp);
function trip(id, start, end, distance, lat, lng, count) {
  const started = when(start);
  return {
    id, started_at: start, ended_at: end, distance_km: distance,
    memo: "테스트 " + id.slice(0, 4),
    events: [],
    points: Array.from({ length: count }, (_, i) => ({
      lat: lat + i * 0.00004,
      lng: lng + i * 0.00004,
      t: started + i * 10000,
      accuracy: 7,
    })),
  };
}
const fixtures = [
  trip("11111111-1111-4111-8111-111111111111",
    "2026-11-16T00:30:00Z", "2026-11-16T00:45:00Z", 3.2, 35.15, 126.81, 70),
  trip("22222222-2222-4222-8222-222222222222",
    "2026-11-16T02:00:00Z", "2026-11-16T02:16:00Z", 4.6, 35.18, 126.85, 70),
  trip("33333333-3333-4333-8333-333333333333",
    "2026-11-16T05:00:00Z", "2026-11-16T05:00:02Z", 0, 35.19, 126.86, 0),
];

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    timezoneId: "Asia/Seoul", serviceWorkers: "block",
    permissions: ["geolocation"],
    geolocation: { latitude: 35.17, longitude: 126.83, accuracy: 8 },
  });
  try {
    await context.addInitScript((records) => {
      window.__rsNativeInstalled = true;
      if (!sessionStorage.getItem("rs-daily-qa")) {
        sessionStorage.setItem("rs-daily-qa", "1");
        localStorage.setItem("rs:trips:guest", JSON.stringify(records));
      }
    }, fixtures);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname.endsWith(".supabase.co"))
        return route.fulfill({ json: [] });
      if (url.hostname.includes("tile.openstreetmap.org"))
        return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    const navigations = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("framenavigated", frame => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });
    await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 25000 });
    const original = await page.evaluate(
      () => localStorage.getItem("rs:trips:guest")
    );
    await page.getByRole("navigation", { name: "주 메뉴" })
      .getByRole("button", { name: "타임라인", exact: true }).click();
    const daySelector = page.getByRole("group", { name: "운행 날짜" })
      .getByRole("button", { name: "2026-11-16 운행 3회" });
    await daySelector.click();
    await page.getByRole("heading", { name: "하루 전체 경로" }).waitFor();
    await page.getByLabel("운행 경로 지도", { exact: true }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector(".rs56-day-overview .leaflet-container") &&
      document.querySelector(".rs56-day-overview .leaflet-overlay-pane")
    );
    await page.waitForFunction(() => {
      const map = window.__rsMap;
      const panes = document.querySelector(".rs56-day-overview .leaflet-overlay-pane");
      return !!(map && panes && panes.children.length);
    }, null, { timeout: 20000 });
    assert.equal(await page.locator(".rs56-ride-choice").count(), 3);
    assert.ok((await page.locator(".rs33-trip-summary").first().innerText()).includes("7.8 km"));
    const center = await page.evaluate(() => {
      const map = window.__rsMap;
      return { lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() };
    });
    assert.ok(center.lat > 35.1 && center.lat < 35.22, "daily map fitted");
    await page.locator(".rs56-ride-choice").first().click();
    await page.locator(".rs33-trip-detail").waitFor();
    await page.getByRole("button", { name: "‹ 운행 목록" }).click();
    await page.getByRole("heading", { name: "하루 전체 경로" }).waitFor();
    await page.locator(".rs56-ride-choice").last().click();
    await page.locator(".rs33-trip-detail").waitFor();
    assert.match(await page.locator(".rs33-trip-summary").last().innerText(), /0 km/);
    assert.equal(await page.evaluate(() => localStorage.getItem("rs:trips:guest")), original);
    assert.deepEqual(errors, []);
    assert.equal(navigations.length, 1);
    console.log("PASS daily-first timeline: 3 saved runs, 2 route groups, 0-km run, detail/back and unchanged GPS records", center);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
