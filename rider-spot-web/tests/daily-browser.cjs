const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const candidate = process.env.RIDER_PREBUILT === "1";
const manifest = candidate
  ? JSON.parse(readFileSync(resolve(__dirname, "../prebuilt/release.json"), "utf8"))
  : null;
const candidateRoot = resolve(__dirname, "../prebuilt");

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
  const browser = await chromium.launch({
    args: [
      "--no-sandbox", "--enable-webgl", "--use-gl=angle",
      "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    ],
  });
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
      if (candidate && url.origin === new URL(ORIGIN).origin) {
        const prefix = "/assets/rider-spot-" + manifest.hash + "/";
        const file = url.pathname === "/" || url.pathname === "/index.html"
          ? "index.html"
          : url.pathname === "/sw.js"
            ? "sw.js"
            : url.pathname.startsWith(prefix)
              ? url.pathname.slice(prefix.length)
              : null;
        if (file && existsSync(resolve(candidateRoot, file))) {
          return route.fulfill({
            path: resolve(candidateRoot, file),
            contentType: file.endsWith(".mjs") ? "text/javascript"
              : file.endsWith(".css") ? "text/css"
              : file.endsWith(".html") ? "text/html" : "application/javascript",
          });
        }
      }
      if (url.hostname.endsWith(".supabase.co"))
        return route.fulfill({ json: [] });
      if (url.hostname.includes("tile.openstreetmap.org"))
        return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    const resourceErrors = [];
    const navigations = [];
    page.on("requestfailed", request => {
      if (/openfreemap|maplibre|jsdelivr/.test(request.url()))
        resourceErrors.push(request.url() + ": " + request.failure()?.errorText);
    });
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
    // The APK must use the exact Positron vector style previously used by
    // the web, not a CSS-filtered OpenStreetMap raster approximation.
    await page.waitForFunction(() => {
      const container = document.querySelector(".rs56-day-overview .map");
      return container?.dataset.rsBasemap === "positron" &&
        Boolean(container.querySelector("canvas.maplibregl-canvas"));
    }, null, { timeout: 30000 }).catch(async error => {
      console.error("Positron loading diagnostic", await page.evaluate(() => ({
        mapBase: document.querySelector(".rs56-day-overview .map")?.dataset.rsBasemap,
        canvasCount: document.querySelectorAll(".maplibregl-canvas").length,
        webgl: Boolean(document.createElement("canvas").getContext("webgl")),
      })), resourceErrors);
      throw error;
    });
    const basemap = await page.evaluate(() => {
      const container = document.querySelector(".rs56-day-overview .map");
      return {
        nativeInstalled: window.__rsNativeInstalled,
        renderer: container.dataset.rsBasemap,
        canvas: container.querySelectorAll("canvas.maplibregl-canvas").length,
        hasFakeRasterFilter: [...document.styleSheets].some(
          sheet => sheet.href?.includes("native-light-map.css")
        ),
      };
    });
    assert.equal(basemap.nativeInstalled, true);
    assert.equal(basemap.renderer, "positron");
    assert.ok(basemap.canvas > 0);
    assert.equal(basemap.hasFakeRasterFilter, false);
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
    // Real-time playback: 30x means ~30 GPS seconds for each wall second,
    // and the route draws progressively rather than showing the full line.
    const dailyPlayer = page.locator(".rs56-day-overview .rs59-player");
    await dailyPlayer.getByRole("combobox", { name: "경로 재생 배속" }).selectOption("30");
    await dailyPlayer.getByRole("button", { name: "경로 재생 시작" }).click();
    await page.waitForFunction(() => {
      const seek = document.querySelector(".rs56-day-overview .rs59-seek");
      return seek && Number(seek.value) > 6000;
    }, null, { timeout: 9000 });
    const dailyClock = await dailyPlayer.locator(".rs59-seek").inputValue();
    assert.ok(Number(dailyClock) < 300000, "timer does not jump to the end");
    assert.ok(await page.evaluate(() =>
      Object.values(window.__rsMap?._layers || {}).some(layer =>
        layer?.options?.className === "rs59-playback-marker"
      )), "playback head should exist on Leaflet canvas map");
    await dailyPlayer.getByRole("button", { name: "경로 재생 일시정지" }).click();
    const paused = Number(await dailyPlayer.locator(".rs59-seek").inputValue());
    await page.waitForTimeout(200);
    const stillPaused = Number(await dailyPlayer.locator(".rs59-seek").inputValue());
    assert.ok(Math.abs(stillPaused - paused) < 7500, "pause must stop elapsed time");
    await dailyPlayer.locator(".rs59-seek").focus();
    await dailyPlayer.locator(".rs59-seek").press("End");
    await page.waitForFunction(() => {
      const player = document.querySelector(".rs56-day-overview .rs59-player");
      const seek = player?.querySelector(".rs59-seek");
      return seek && Math.abs(Number(seek.value) - Number(seek.max)) < 1000;
    }, null, { timeout: 5000 });
    await dailyPlayer.getByRole("button", { name: "경로 재생 종료하고 전체 경로 보기" }).click();
    await page.waitForFunction(() =>
      !Object.values(window.__rsMap?._layers || {}).some(layer =>
        layer?.options?.className === "rs59-playback-marker"
      )
    );
    await page.locator(".rs56-ride-choice").first().click();
    await page.locator(".rs33-trip-detail .rs59-player").waitFor();
    const detailPlayer = page.locator(".rs33-trip-detail .rs59-player");
    await detailPlayer.getByRole("button", { name: "경로 재생 시작" }).click();
    await page.waitForFunction(() =>
      Number(document.querySelector(".rs33-trip-detail .rs59-seek")?.value) > 1500,
      null, { timeout: 9000 }
    );
    await detailPlayer.getByRole("button", { name: "경로 재생 일시정지" }).click();
    await page.locator(".rs33-trip-detail").waitFor();
    await page.waitForFunction(() =>
      document.querySelector(".rs33-trip-detail .map")?.dataset.rsBasemap === "positron",
      null, { timeout: 30000 }
    );
    await page.getByRole("button", { name: "‹ 운행 목록" }).click();
    await page.getByRole("heading", { name: "하루 전체 경로" }).waitFor();
    await page.waitForFunction(() =>
      document.querySelector(".rs56-day-overview .map")?.dataset.rsBasemap === "positron",
      null, { timeout: 30000 }
    );
    await page.locator(".rs56-ride-choice").last().click();
    await page.locator(".rs33-trip-detail").waitFor();
    assert.match(await page.locator(".rs33-trip-summary").last().innerText(), /0 km/);
    assert.equal(await page.evaluate(() => localStorage.getItem("rs:trips:guest")), original);
    assert.deepEqual(errors, []);
    assert.equal(navigations.length, 1);
    console.log("PASS native Positron + GPS-time playback 30x, pause, seek, reset, daily/detail/back, saved GPS unchanged", center);
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
