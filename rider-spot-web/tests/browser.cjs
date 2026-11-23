const { chromium } = require("playwright");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { strict: assert } = require("node:assert");
const { sampleTrip, tripId, userId } = require("./fixtures.cjs");

const production = process.env.RIDER_BASELINE_DIR;
const candidate = resolve(__dirname, "../dist");
const origin = "https://rider-spot.jazzhjm.workers.dev";
const baseUrl = process.env.RIDER_TEST_URL || origin;
const baseline = process.argv.includes("--baseline");
const benchmark = process.argv.includes("--benchmark");
const bridgePath = process.env.RIDER_APK_BRIDGE;
const mapLabel = "주변 지도";
const courseLabel = "운행 경로 지도";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2S0AAAAASUVORK5CYII=";
const jwt =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
  Buffer.from(
    JSON.stringify({
      sub: userId,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url") +
  ".test";
const user = {
  id: userId,
  aud: "authenticated",
  email: "rider-qa@example.test",
  role: "authenticated",
  app_metadata: { provider: "google" },
  user_metadata: { nickname: "QA" },
  created_at: "2026-11-01T00:00:00Z",
};
const session = {
  access_token: jwt,
  refresh_token: "qa-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user,
};
const baseError = [];
let browser;

async function open({
  trip,
  native = false,
  account = false,
  active = false,
  legacy = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 842 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    timezoneId: "Asia/Seoul",
    serviceWorkers: "block",
    permissions: ["geolocation"],
    geolocation: { latitude: 35.17, longitude: 126.82, accuracy: 9 },
    ignoreHTTPSErrors: true,
  });
  const received = [];
  const records = new Map();
  let networkError = false;
  let roadRequests = 0;
  if (context.routeWebSocket)
    await context.routeWebSocket("**/realtime/v1/websocket?**", (socket) =>
      socket.close(),
    );
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url()),
      request = route.request();
    if (url.pathname === "/api/route-match") {
      roadRequests++;
      const { points } = request.postDataJSON();
      return route.fulfill({
        json: { lines: [points.map(({ lat, lng }) => ({ lat, lng }))] },
      });
    }
    if (url.hostname.endsWith(".supabase.co")) {
      if (url.pathname === "/auth/v1/user")
        return route.fulfill({ json: user });
      if (url.pathname === "/rest/v1/trips") {
        if (request.method() === "POST") {
          const record = request.postDataJSON();
          received.push(record);
          if (networkError)
            return route.fulfill({
              status: 503,
              json: { message: "QA offline" },
            });
          records.set(record.id, record);
          return route.fulfill({ status: 201 });
        }
        return route.fulfill({ json: [...records.values()] });
      }
      return route.fulfill({ json: [] });
    }
    if (url.hostname.includes("tile.openstreetmap.org"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(png, "base64"),
      });
    if (url.origin === origin && !process.env.RIDER_TEST_URL) {
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const newer = resolve(candidate, "." + pathname);
      const older = production && resolve(production, "." + pathname);
      const file = !baseline && existsSync(newer) ? newer : older;
      if (file && existsSync(file))
        return route.fulfill({
          path: file,
          ...(pathname.endsWith(".mjs")
            ? { contentType: "application/javascript" }
            : {}),
        });
      return route.fulfill({ status: 404 });
    }
    if (url.origin === new URL(baseUrl).origin) return route.continue();
    return route.abort();
  });
  await context.addInitScript(
    ({ trip, native, account, active, legacy, session, userId }) => {
      if (!sessionStorage.getItem("rider-test-fixture-loaded")) {
        sessionStorage.setItem("rider-test-fixture-loaded", "1");
        if (account)
          localStorage.setItem(
            "sb-qkcqzhkvfbymzjdktshp-auth-token",
            JSON.stringify(session),
          );
        if (trip)
          localStorage.setItem(
            (legacy ? "" : "rs:") +
              (active ? "active:" : "trips:") +
              (account ? userId : "guest"),
            JSON.stringify(active ? trip : [trip]),
          );
      }
      window.__riderTest = {
        maps: [],
        long: [],
        startedAt: 0,
        detailAt: 0,
        routeAt: 0,
      };
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          if (entry.startTime >= __riderTest.startedAt)
            __riderTest.long.push(entry.duration);
      }).observe({ type: "longtask" });
      new MutationObserver(() => {
        if (!__riderTest.startedAt) return;
        if (
          !__riderTest.detailAt &&
          document.querySelector(".rs33-trip-detail .leaflet-container")
        )
          __riderTest.detailAt = performance.now();
        if (
          !__riderTest.routeAt &&
          document.querySelector(
            ".rs33-trip-detail .leaflet-overlay-pane canvas,.rs33-trip-detail .leaflet-overlay-pane svg path",
          )
        )
          __riderTest.routeAt = performance.now();
      }).observe(document, { subtree: true, childList: true });
      if (!native) {
        window.__rsNativeInstalled = true;
        return;
      }
      const cacheKey = "rider-test-sqlite";
      const device = JSON.parse(sessionStorage.getItem(cacheKey) || "null") || {
        activeId: active ? trip?.id : null,
        lastStoppedId: legacy ? trip?.id : null,
        paused: false,
        gpsServiceActive: true,
        points: legacy
          ? trip.points.map((row, i) => ({ ...row, seq: i + 1 }))
          : [],
        calls: [],
        fix: { lat: 35.17, lng: 126.82, accuracy: 8, t: Date.now() },
      };
      window.__riderDevice = device;
      window.__saveDevice = () =>
        sessionStorage.setItem(cacheKey, JSON.stringify(device));
      window.RiderSpotHost = {
        postMessage(serialized) {
          const { id, action, tripId, afterSeq, limit, paused } =
            JSON.parse(serialized);
          device.calls.push(action);
          let data = {};
          let error;
          if (action === "state")
            data = {
              activeId: device.activeId,
              lastStoppedId: device.lastStoppedId,
              paused: device.paused,
              gpsServiceActive: true,
              gpsLastSavedAt: Date.now(),
              nativePointCount: device.points.length,
            };
          if (action === "geo-current") data = device.fix;
          if (action === "start") {
            device.activeId = tripId;
            device.lastStoppedId = null;
            device.points = [];
          }
          if (action === "pause") device.paused = paused;
          if (action === "stop" && device.activeId === tripId) {
            device.activeId = null;
            device.lastStoppedId = tripId;
          }
          if (action === "points") {
            if (device.failRead && device.lastStoppedId === tripId) {
              error = "simulated SQLite read failure";
              device.failRead = false;
            } else
              data = {
                points: device.points
                  .filter((point) => point.seq > (afterSeq || 0))
                  .slice(0, limit),
              };
          }
          window.__saveDevice();
          queueMicrotask(() =>
            window.RiderSpotHost.onmessage({
              data: JSON.stringify({ id, ok: !error, data, error }),
            }),
          );
        },
      };
    },
    { trip, native, account, active, legacy, session, userId },
  );
  if (native) {
    if (!bridgePath)
      throw Error("Set RIDER_APK_BRIDGE to the published APK bridge source.");
    await context.addInitScript({ content: readFileSync(bridgePath, "utf8") });
  }
  const page = await context.newPage();
  const errors = [];
  let mainNavigations = 0;
  page.on("pageerror", (error) => {
    errors.push(error.message);
    if (process.env.RIDER_DEBUG) console.error(error.stack);
  });
  // framenavigated also fires for history.pushState/replaceState in
  // Chromium; only DOMContentLoaded indicates a full document load.
  // The tab switch regression must count reloads, not SPA history updates.
  page.on("domcontentloaded", () => { mainNavigations++; });
  page.on("dialog", (dialog) => dialog.accept());
  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  assert.match(await page.title(), /라이더스팟/);
  await page.getByLabel(mapLabel, { exact: true }).waitFor();
  return {
    context,
    page,
    errors,
    received,
    records,
    navs: () => mainNavigations,
    roadRequests: () => roadRequests,
    failNetwork: (flag) => {
      networkError = flag;
    },
  };
}
function tab(page, name) {
  return page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("button", { name, exact: true });
}
function camera(page) {
  return page.evaluate(() => {
    const map = window.__rsMap,
      p = map.getCenter();
    return [p.lat, p.lng, map.getZoom()];
  });
}
function resizeCamera(expected, actual) {
  const zoom=expected[2], m=256*Math.pow(2,zoom)/(2*Math.PI);
  const projection=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
  const pixels=Math.hypot(
    (actual[1]-expected[1])*Math.PI/180*m,
    (projection(actual[0])-projection(expected[0]))*m
  );
  assert.ok(pixels<=1.5 && Math.abs(zoom-actual[2])<0.04,
    "unexpected map camera movement after resize: "+pixels.toFixed(2)+"px");
}
function sameCamera(expected, actual) {
  assert.ok(
    Math.abs(expected[0] - actual[0]) < 0.002 &&
      Math.abs(expected[1] - actual[1]) < 0.002,
    `center changed from ${expected} to ${actual}`,
  );
  assert.ok(
    Math.abs(expected[2] - actual[2]) < 0.04,
    `zoom changed from ${expected} to ${actual}`,
  );
}
async function openTrip(page, trip) {
  await tab(page, "타임라인").click();
  const row = page.getByRole("button", { name: new RegExp(trip.memo) });
  if (!(await row.count()))
    await page.getByRole("button", { name: "전체 기록 보기" }).click();
  await row.evaluate((button) =>
    button.addEventListener(
      "click",
      () => {
        __riderTest.startedAt = performance.now();
        __riderTest.long = [];
        __riderTest.detailAt = __riderTest.routeAt = 0;
      },
      { once: true },
    ),
  );
  await row.click();
  await page.getByLabel(courseLabel, { exact: true }).waitFor();
  await page.waitForFunction(() => __riderTest.routeAt > 0);
  return page.evaluate(() => ({
    detailMs: Math.round(__riderTest.detailAt - __riderTest.startedAt),
    routeMs: Math.round(__riderTest.routeAt - __riderTest.startedAt),
    worstLongTask: Math.max(0, ...__riderTest.long),
  }));
}
async function gesture(cdp, page, label, dir) {
  const box = await page.getByLabel(label, { exact: true }).boundingBox();
  const x = Math.round(box.x + box.width / 2),
    y = Math.round(box.y + box.height / 2);
  const steps = dir === "out" ? [103, 85, 68, 48, 28] : [28, 48, 68, 85, 103];
  for (let i = 0; i < steps.length; i++) {
    const dx = steps[i];
    await cdp.send("Input.dispatchTouchEvent", {
      type: i ? "touchMove" : "touchStart",
      touchPoints: [
        { x: x - dx, y, id: 1 },
        { x: x + dx, y, id: 2 },
      ],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(275);
}
async function facilitySheetTest() {
  const { context, page, errors } = await open({ account: true });
  try {
    const documentStartedAt = await page.evaluate(() => performance.timeOrigin);
    let saved;
    await context.route("**/rest/v1/rider_places*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      saved = route.request().postDataJSON();
      await route.fulfill({ status: 201 });
    });
    const reportMenu = page.locator(".rs-map-v2-report");
    const sheet = page.getByRole("dialog", { name: "편의시설 등록" });
    await reportMenu.locator("summary").click();
    await reportMenu.getByRole("button", { name: "편의시설 등록" }).click();
    await sheet.waitFor();
    assert.equal(await page.evaluate(() => window.__rsNavigation.tab), "nearby");
    await sheet.getByLabel("장소 이름").fill("테스트 화장실");
    await sheet.getByLabel("이용 팁").fill("주차장 입구");
    await sheet.getByRole("button", { name: /지도에서 위치 선택하기/ }).click();
    await sheet.waitFor({ state: "hidden" });
    const picker = page.locator("#rs-map-picker");
    await picker.waitFor();
    await picker.getByRole("button", { name: "취소" }).click();
    await sheet.waitFor();
    assert.equal(await sheet.getByLabel("장소 이름").inputValue(), "테스트 화장실");
    await sheet.getByRole("button", { name: /지도에서 위치 선택하기/ }).click();
    await picker.waitFor();
    await page.evaluate(() => window.__rsMap.fire("click", { latlng: { lat: 35.16, lng: 126.83 } }));
    await picker.getByRole("button", { name: "이 위치로 등록" }).click();
    await sheet.waitFor();
    assert.equal(await sheet.getByLabel("이용 팁").inputValue(), "주차장 입구");
    await sheet.getByText(/지도 선택 완료/).waitFor();
    await sheet.getByRole("button", { name: "시설 등록", exact: true }).click();
    await sheet.waitFor({ state: "hidden" });
    assert.equal(saved?.title, "테스트 화장실");
    assert.equal(saved?.category, "화장실");
    assert.equal(saved?.lat, 35.16);
    assert.equal(saved?.lng, 126.83);
    await reportMenu.locator("summary").click();
    await reportMenu.getByRole("button", { name: "편의시설 등록" }).click();
    await sheet.waitFor();
    assert.equal(await sheet.getByLabel("장소 이름").inputValue(), "");
    await page.evaluate(() => window.__rsHandleBack());
    await sheet.waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.__rsNavigation.tab), "nearby");
    assert.equal(await page.evaluate(() => performance.timeOrigin), documentStartedAt);
    assert.deepEqual(errors, []);
    console.log("PASS facility sheet: map, position selection, draft, save and Android Back");
  } finally {
    await context.close();
  }
}
async function mapTest() {
  const { context, page, errors, navs } = await open({ trip: sampleTrip(100) });
  try {
    const cdp = await context.newCDPSession(page);
    await page.waitForFunction(() => window.__rsMap?.getZoom() === 16);
    await page.evaluate(() => {
      window.__rs33MapTarget = {
        id: "facility-test",
        lat: 35.16,
        lng: 126.83,
        layer: "shelters",
      };
      window.dispatchEvent(new Event("riderspot:map-target"));
    });
    const before = await camera(page);
    for (let i = 0; i < 30; i++)
      await gesture(cdp, page, mapLabel, i < 15 ? "out" : i % 2 ? "in" : "out");
    await gesture(cdp, page, mapLabel, "out");
    const low = await camera(page);
    assert.ok(Math.abs(low[2] - 7.5) < 0.001);
    assert.ok(low[2] < before[2]);
    const box = await page.getByLabel(mapLabel, { exact: true }).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 90,
      box.y + box.height / 2 + 30,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.waitForTimeout(700);
    const panned = await camera(page);
    assert.ok(Math.abs(panned[1] - low[1]) > 0.01);
    await gesture(cdp, page, mapLabel, "out");
    assert.ok(Math.abs((await camera(page))[2] - 7.5) < 0.001);
    const chosen = await camera(page);
    await context.setGeolocation({
      latitude: 35.184,
      longitude: 126.81,
      accuracy: 7,
    });
    await page.waitForFunction(
      () => window.__rsRideApi.position.lat === 35.184,
    );
    sameCamera(chosen, await camera(page));
    await page.setViewportSize({ width: 447, height: 780 });
    await page.waitForTimeout(300);
    resizeCamera(chosen, await camera(page));
    for (let i = 0; i < 5; i++) {
      await tab(page, "타임라인").click();
      await page.getByRole("heading", { name: "타임라인" }).waitFor();
      await tab(page, "지도").click();
      await page.getByLabel(mapLabel, { exact: true }).waitFor();
      resizeCamera(chosen, await camera(page));
    }
    assert.equal(navs(), 1);
    await page.reload();
    await page.getByLabel(mapLabel, { exact: true }).waitFor();
    await page.waitForFunction(() => window.__rsRideApi.gpsStatus === "ready");
    if (baseline) {
      sameCamera(chosen, await camera(page));
    } else {
      await page.waitForFunction(() => {
        const p = window.__rsMap?.getCenter();
        const gps = window.__rsRideApi?.position;
        return p && gps && Math.abs(p.lat - gps.lat) < 0.0001 &&
          Math.abs(p.lng - gps.lng) < 0.0001 &&
          Math.abs(window.__rsMap.getZoom() - 16) < 0.01;
      }, null, { timeout: 7000 });
    }
    await page
      .getByRole("button", { name: "내 위치로 이동", exact: true })
      .click();
    await page
      .waitForFunction(() => window.__rsMap.getZoom() === 16, null, {
        timeout: 7000,
      })
      .catch(async (error) => {
        console.error(
          "recenter diagnostic",
          await page.evaluate(() => ({
            zoom: window.__rsMap.getZoom(),
            position: window.__rsRideApi.position,
            focus: window.__rsRideApi.focus,
            status: window.__rsRideApi.gpsStatus,
            problem: window.__rsRideApi.gpsProblem,
          })),
          errors,
        );
        throw error;
      });
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => {
        document.querySelector(".leaflet-control-zoom-out").click();
        window.__rsGoToTab("trips");
      });
      await page.getByRole("heading", { name: "타임라인" }).waitFor();
      await tab(page, "지도").click();
      await page.getByLabel(mapLabel, { exact: true }).waitFor();
    }
    await page.waitForTimeout(350);
    assert.deepEqual(errors, []);
    console.log(
      "PASS main map: 31 touch pinches, minimum zoom, pan, updated GPS, resize, 5 tab cycles, reload and explicit location, 10 immediate zoom-and-switch cycles",
    );
  } finally {
    await context.close();
  }
}
async function timelineTest(count) {
  const trip = sampleTrip(count);
  const { context, page, errors, roadRequests } = await open({ trip });
  try {
    await page.evaluate(() =>
      window.dispatchEvent(new Event("riderspot:native-events")),
    );
    const metric = await openTrip(page, trip);
    if (!baseline && !benchmark) {
      const cdp = await context.newCDPSession(page);
      await page.getByRole("button", { name: "시간 끄기" }).click();
      await page.getByRole("button", { name: "시간 켜기" }).click();
      const initial = await camera(page);
      for (let i = 0; i < (count === 15000 ? 31 : 4); i++)
        await gesture(
          cdp,
          page,
          courseLabel,
          count === 15000 && i > 15 && i % 2 ? "in" : "out",
        );
      if (count === 15000)
        assert.ok(Math.abs((await camera(page))[2] - 7.5) < 0.001);
      const shown = await camera(page);
      await page.getByRole("button", { name: "크게 보기" }).click();
      await page.waitForTimeout(200);
      resizeCamera(shown, await camera(page));
      await page.getByRole("button", { name: "닫기", exact: true }).click();
      await page.waitForTimeout(200);
      resizeCamera(shown, await camera(page));
      await page.getByRole("button", { name: "전체 경로" }).click();
      sameCamera(initial, await camera(page));
      await page.getByRole("button", { name: /운행 이벤트/ }).click();
      assert.equal(
        await page.locator(".rs44-event-list li").count(),
        trip.events.length,
      );
      await page.locator('summary[aria-label="경로 추가 옵션"]').click();
      await page
        .getByRole("button", { name: "도로 보정", exact: true })
        .click();
      if (count === 100) {
        await page.getByRole("button", { name: "원본 경로로 보기" }).waitFor();
        assert.ok(roadRequests() > 0);
        await page.getByRole("button", { name: "원본 경로로 보기" }).click();
      } else {
        await page.getByText(/최대 5개/).waitFor();
        assert.equal(roadRequests(), 0);
      }
      await tab(page, "지도").click();
      await openTrip(page, trip);
      assert.equal(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("rs:trips:guest"))[0].points.length,
        ),
        count,
      );
      assert.deepEqual(errors, []);
    }
    if (baseline) baseError.push(...errors);
    console.log(
      `${baseline ? "BASELINE" : "PASS"} timeline ${count}: ${JSON.stringify(metric)}`,
    );
  } finally {
    await context.close();
  }
}
async function nativeTest() {
  const app = await open({ native: true, account: true });
  const { context, page, received, records, errors, failNetwork } = app;
  try {
    await page.waitForFunction(() => Boolean(window.__rsGPS42NativeRead));
    await page.locator(".ride-launch button").click();
    await page.getByRole("button", { name: "운행 종료", exact: true }).waitFor();
    await tab(page, "타임라인").click();
    await page.waitForFunction(() => Boolean(__riderDevice.activeId));
    const id = await page.evaluate(() => __riderDevice.activeId);
    const source = sampleTrip(5000, { active: true, id });
    await page.evaluate((points) => {
      __riderDevice.points = points.map((p, i) => ({ ...p, seq: i + 1 }));
      __saveDevice();
    }, source.points);
    await page.evaluate(() => window.__rsGPS41Poll());
    await page.getByRole("button", { name: "휴식", exact: true }).click();
    await page.waitForFunction(() => __riderDevice.paused);
    assert.equal(received.length, 0);
    await page.reload();
    await page.waitForFunction((id) => window.__rsRideApi?.trip?.id === id, id);
    await tab(page, "타임라인").click();
    await page.getByRole("button", { name: "운행 재개" }).click();
    await page.waitForFunction(() => !__riderDevice.paused);
    await page
      .getByRole("button", { name: "지도에서 내 현재 위치로 이동" })
      .click();
    try {
      await page.waitForFunction(() => window.__rsMap?.getZoom() === 17);
    } catch (error) {
      console.error("Native follow camera diagnostic", await page.evaluate(() => ({
        mapZoom: window.__rsMap?.getZoom(), mapCenter: window.__rsMap?.getCenter(),
        mapCount: document.querySelectorAll(".leaflet-container").length,
        tripId: window.__rsRideApi?.trip?.id,
        gpsMetrics: window.__rsTimelineGpsMetrics,
        page: document.querySelector(".rs33-trip-detail") ? "detail" : "timeline",
      })));
      throw error;
    }
    await page.evaluate(() => {
      __riderDevice.failRead = true;
      __saveDevice();
    });
    await page.getByRole("button", { name: "운행 종료", exact: true }).click();
    await page.getByText("simulated SQLite read failure").waitFor();
    assert.equal(received.length, 0);
    failNetwork(true);
    await page.getByRole("button", { name: "운행 종료", exact: true }).click();
    await page
      .getByRole("button", { name: "서버 저장", exact: true })
      .waitFor();
    await page.waitForFunction(
      ({ userId, id }) =>
        JSON.parse(
          localStorage.getItem("rs:pending:trips:" + userId) || "[]",
        ).includes(id),
      { userId, id },
    );
    assert.equal(records.size, 0);
    failNetwork(false);
    await page.reload();
    await page.waitForFunction(
      ({ userId, id }) =>
        !JSON.parse(
          localStorage.getItem("rs:pending:trips:" + userId) || "[]",
        ).includes(id),
      { userId, id },
    );
    const record = records.get(id);
    const device = await page.evaluate(() => __riderDevice);
    // v58: only a small summary reaches the server. The original 5,000
    // samples remain solely in the Android SQLite recorder.
    assert.equal(record.points.length, 0, "native coordinates must not be uploaded");
    assert.equal(device.points.length, 5000);
    const localStored=await page.evaluate(userId=>
      JSON.parse(localStorage.getItem("rs:trips:"+userId)||"[]"),userId);
    const summary=localStored.find(row=>row.id===id);
    assert.equal(summary?.points?.length,0,"WebView stores metadata, not GPS duplication");
    assert.equal(summary?.gps_point_count,5000);
    assert.ok(Object.keys(summary?.gps_day_ranges||{}).length);
    assert.equal(record.events.filter((e) => e.type === "운행 종료").length, 1);
    assert.equal(records.size, 1);
    assert.equal(device.calls.filter((call) => call === "stop").length, 1);
    assert.deepEqual(errors, []);
    console.log(
      "PASS v1.0.6 JS bridge: native sample start/pause/reload/resume/stop, failed SQLite read retry, offline queue and single server row",
    );
  } finally {
    await context.close();
  }
}
(async () => {
  browser = await chromium.launch({
    executablePath: process.env.RIDER_CHROMIUM || undefined,
    args: process.env.RIDER_CHROMIUM
      ? ["--no-sandbox", "--no-zygote"]
      : ["--no-sandbox"],
  });
  try {
    const subset = process.env.RIDER_TEST_CASE;
    if (subset === "facility") await facilitySheetTest();
    if (!benchmark && !baseline && (!subset || subset === "map"))
      await mapTest();
    if (!subset || subset === "timeline")
      for (const count of [100, 1000, 5000, 15000]) await timelineTest(count);
    if (baseline)
      console.log(`BASELINE JS errors: ${JSON.stringify(baseError)}`);
    if (
      !benchmark &&
      !baseline &&
      bridgePath &&
      (!subset || subset === "native")
    )
      await nativeTest();
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
