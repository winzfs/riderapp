/* Rider Spot GPS v42: on-device native SQLite -> WebView timeline recovery.
 * Android bridge only; this code NEVER posts location to an HTTP endpoint.
 * Does not replace native bridge onmessage: it forwards every other reply.
 */
(() => {
  "use strict";
  if (
    window.__rsGPS41Installed ||
    !window.RiderSpotHost ||
    !window.__rsNativeInstalled
  )
    return;
  window.__rsGPS41Installed = true;
  window.__rsGPS42Installed = true;
  const host = window.RiderSpotHost;
  const oldReply = host.onmessage;
  const pending = new Map();
  let nextId = 900000000;
  let busy = false;
  let lastReopen = 0;
  let lastWarning = 0;
  let lastTrip = "";
  let nextSeq = 0;

  host.onmessage = (event) => {
    let result;
    try {
      result = JSON.parse(event.data);
    } catch {
      /* bridge's own handler handles errors */
    }
    if (result && pending.has(result.id)) {
      const task = pending.get(result.id);
      pending.delete(result.id);
      clearTimeout(task.timer);
      if (result.ok) task.resolve(result.data);
      else task.reject(new Error(result.error || "기기 GPS 조회 실패"));
      return;
    }
    if (typeof oldReply === "function") oldReply.call(host, event);
  };

  function call(action, extra = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("기기 GPS 응답 지연"));
      }, 6000);
      pending.set(id, { resolve, reject, timer });
      try {
        host.postMessage(JSON.stringify({ id, action, ...extra }));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  // Query only the SQLite sequence interval that can contain this calendar
  // day's samples. This reuses the existing indexed Android "points" action;
  // no APK upgrade, file rewrite, or cloud upload is required.
  async function allPointsForDay(id, day, range) {
    const from = Date.parse(day + "T00:00:00+09:00");
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(day) || !Number.isFinite(from))
      throw Error("GPS 조회 날짜가 올바르지 않아요.");
    const until = from + 86400000;
    const validRange = Number.isSafeInteger(range?.firstSeq) &&
      Number.isSafeInteger(range?.lastSeq) &&
      range.firstSeq > 0 && range.lastSeq >= range.firstSeq;
    if (!validRange) {
      // Pre-v58 trips have no sequence-day index. Read only this single trip,
      // then filter it, without scanning the user's other SQLite sessions.
      const raw = await allPoints(id);
      return { points: raw.filter(p => p.t >= from && p.t < until),
        readCount: raw.length, indexed: false };
    }
    const points = [];
    let cursor = range.firstSeq - 1, readCount = 0;
    while (cursor < range.lastSeq) {
      const limit = Math.min(250, Math.max(1, range.lastSeq - cursor));
      const response = await call("points", { tripId: id, afterSeq: cursor, limit });
      const batch = Array.isArray(response?.points) ? response.points : [];
      if (!batch.length) break;
      let next = cursor, reachedEnd = false;
      for (const p of batch) {
        if (!Number.isSafeInteger(p?.seq) || p.seq <= next)
          throw Error("GPS 읽기 순서를 확인해 주세요.");
        next = p.seq;
        if (p.seq > range.lastSeq) { reachedEnd = true; break; }
        if (Number.isFinite(p.t) && Number.isFinite(p.lat) &&
            Number.isFinite(p.lng) && p.t >= from && p.t < until)
          points.push(p);
      }
      readCount += batch.length;
      cursor = next;
      if (reachedEnd || cursor >= range.lastSeq || batch.length < limit) break;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return { points: points.sort((a,b) => a.t - b.t),
      readCount, indexed: true };
  }

  function badge(message, warning = false) {
    const api = window.__rsRideApi;
    const tripId = api?.trip?.id;
    let el = document.querySelector("#rs-gps-capture-state");
    if (!tripId) {
      if (el) el.remove();
      return;
    }
    const container =
      document.querySelector(".rs33-course-footer") ||
      document.querySelector(".rs33-trip-detail");
    if (!container) return;
    if (!el) {
      el = document.createElement("div");
      el.id = "rs-gps-capture-state";
      el.setAttribute("role", "status");
      container.prepend(el);
    }
    el.className = warning
      ? "rs-gps-capture-state rs-gps-capture-warning"
      : "rs-gps-capture-state";
    el.textContent = message;
  }
  function resetForTrip(id) {
    if (id !== lastTrip) {
      lastTrip = id;
      nextSeq = 0; // Recover from the start even if old bridge already skipped points.
    }
  }

  // A WebView reload or sign-in change can leave an Android SQLite session alive
  // while React creates a different trip id. Never stop or overwrite that native
  // session on an automatic retry; offer a deliberate, on-device restoration.
  let recovering = false;
  const recoveryId = "rs-gps-v42-recovery";
  const localRecord = (key) => {
    // Both the modern unprefixed key and the older rs: key exist across APKs.
    // Read either without modifying or removing a prior active record.
    for (const name of [key, "rs:" + key]) {
      try {
        const raw = localStorage.getItem(name);
        if (raw != null) return JSON.parse(raw);
      } catch { /* Leave unreadable records intact for manual recovery. */ }
    }
    return null;
  };
  const localSave = (key, value) =>
    localStorage.setItem("rs:" + key, JSON.stringify(value));
  const validUuid = (id) =>
    typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
  async function currentUserId() {
    try {
      return (
        (await window.__rsClient?.auth.getSession())?.data?.session?.user?.id ||
        "guest"
      );
    } catch {
      return "guest";
    }
  }
  async function allPoints(id) {
    const points = [];
    let cursor = 0;
    while (true) {
      const response = await call("points", {
        tripId: id,
        afterSeq: cursor,
        limit: 250,
      });
      const batch = Array.isArray(response?.points) ? response.points : [];
      let next = cursor;
      for (const p of batch) {
        if (!Number.isSafeInteger(p?.seq) || p.seq <= next)
          throw Error("GPS 읽기 순서를 확인해 주세요.");
        next = p.seq;
        if (
          Number.isFinite(p.t) &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng)
        )
          points.push(p);
      }
      cursor = next;
      if (batch.length < 250) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return points.sort((a, b) => a.t - b.t);
  }
  const rootForBanner = () =>
    document.querySelector(".rs33-trip-detail, .rs33-timeline");
  function removeRecoveryNotice() {
    document.getElementById(recoveryId)?.remove();
  }
  function showRecoveryNotice(nativeId, currentId) {
    if (!validUuid(nativeId)) return;
    let el = document.getElementById(recoveryId);
    const parent = rootForBanner();
    if (!parent) return;
    if (!el) {
      el = document.createElement("div");
      el.id = recoveryId;
      el.className = "rs-gps-v42-recovery";
      el.setAttribute("role", "alert");
      const message = document.createElement("p");
      message.textContent =
        "기기에 이전 운행의 GPS 기록이 남아 있어요. 새 기록과 연결하지 않고 안전하게 복구할 수 있어요.";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "rs-gps-v42-action";
      button.textContent = "기존 운행 복구하고 이어서 기록";
      button.addEventListener("click", async () => {
        if (recovering) return;
        recovering = true;
        button.disabled = true;
        button.textContent = "기기 기록 확인 중…";
        try {
          await restoreNativeTrip(nativeId);
        } catch (error) {
          recovering = false;
          button.disabled = false;
          button.textContent = "복구 다시 시도";
          message.textContent =
            "운행 복구에 실패했어요. 기기 GPS 원본은 그대로 남아 있습니다. " +
            (error?.message || "");
        }
      });
      el.append(message, button);
      parent.prepend(el);
    }
  }
  async function restoreNativeTrip(expectedId) {
    const state = await call("state");
    if (!validUuid(expectedId) || state?.activeId !== expectedId)
      throw new Error(
        "기기의 운행 상태가 변경되었습니다. 화면을 다시 열어 주세요.",
      );
    const userId = await currentUserId();
    const activeKey = "active:" + userId;
    const current = localRecord(activeKey);
    // Preserve the recently created web-only record; NEVER upload it as a
    // completed trip or delete Android SQLite samples.
    if (current?.id && current.id !== expectedId) {
      localSave("trip-rescue:" + current.id, current);
    }
    const matched =
      current?.id === expectedId
        ? current
        : localRecord("active:guest")?.id === expectedId
          ? localRecord("active:guest")
          : null;
    // The source-of-truth points stay in Android SQLite. Fetch only the first
    // sample when necessary for start-time recovery; the existing 3s polling
    // rehydrates map points in memory without filling localStorage.
    const earliest = !Number(state.startedAt) && !matched?.started_at
      ? await call("points", {tripId:expectedId,afterSeq:0,limit:1})
      : null;
    const startedAt = Number(state.startedAt) ||
      earliest?.points?.[0]?.t || Date.now();
    const restored = {
      id: expectedId,
      user_id: userId === "guest" ? null : userId,
      started_at: matched?.started_at || new Date(startedAt).toISOString(),
      ended_at: null,
      points: [], // Native SQLite will replay the full route into React memory.
      distance_km: Number(matched?.distance_km) || 0,
      events: Array.isArray(matched?.events)
        ? matched.events
        : [
            {
              type: "운행 시작 · 기기 기록 복구",
              at: new Date(startedAt).toISOString(),
            },
          ],
      memo: matched?.memo || null,
    };
    // Never write the full recovered route to localStorage. Polling and final
    // stop already read it from SQLite; no GPS coordinates are discarded.
    const api = window.__rsRideApi;
    if (!api?.restoreActive)
      throw new Error("운행 화면이 준비되면 다시 눌러 주세요.");
    window.__rsGPSRestoringNativeId = expectedId;
    try {
      if (api.restoreActive(restored) === false)
        throw new Error("이미 다른 운행이 활성화돼 있어요. 운행 상태를 확인해 주세요.");
      window.__rsGPSRestoredNativeId = expectedId;
    } finally {
      delete window.__rsGPSRestoringNativeId;
    }
    removeRecoveryNotice();
  }
  window.__rsGPS42PreflightStart = async () => {
    if (!window.RiderSpotHost) return false;
    try {
      const state = await call("state");
      const active = state?.activeId;
      if (!validUuid(active)) return false;
      // Starting a second trip while one is still in native SQLite is always
      // unsafe. Do not let React create a new UUID just to fail in Java.
      showRecoveryNotice(active, window.__rsRideApi?.trip?.id || null);
      window.__rsGoToTab?.("trips");
      return true;
    } catch (error) {
      // On a broken bridge we cannot safely start an Android recording.
      badge("기기 GPS 연결 확인 중 · 다시 시작해 주세요", true);
      return true;
    }
  };

  function mayRetryFreshNativeStart(trip, status) {
    if (!trip?.id || trip.ended_at || status?.activeId ||
        status?.lastStoppedId === trip.id) return false;
    const started = Date.parse(trip.started_at || "");
    // Recovery of a historical web-only active record is NOT an instruction
    // to create a new native recording. Only retry a just-started session.
    if (!Number.isFinite(started) || Math.abs(Date.now() - started) > 60_000)
      return false;
    try {
      const uid = trip.user_id || "guest";
      const histories = [
        localRecord("trips:" + uid),
        JSON.parse(localStorage.getItem("trips:" + uid) || "[]"),
      ];
      if (histories.some(rows => Array.isArray(rows) &&
          rows.some(row => row?.id === trip.id && row.ended_at))) return false;
    } catch { return false; }
    return true;
  }

  async function poll() {
    if (busy) return;
    const api = window.__rsRideApi;
    const id = api?.trip?.id;
    if (!id || api?.trip?.ended_at) {
      badge("");
      return;
    }
    busy = true;
    resetForTrip(id);
    try {
      let status = await call("state");
      if (window.__rsRideApi?.trip?.id !== id) return;
      if (validUuid(status.activeId) && status.activeId !== id) {
        showRecoveryNotice(status.activeId, id);
        badge(
          "기기에는 이전 운행이 기록 중입니다 · 위의 복구 버튼을 눌러 주세요",
          true,
        );
        return;
      }
      removeRecoveryNotice();
      // If the original APK wrapper failed to start the foreground service,
      // retry once while the app is visible. Never restart a notification-stopped trip.
      if (
        mayRetryFreshNativeStart(api.trip, status) &&
        !api.paused &&
        document.visibilityState === "visible" &&
        Date.now() - lastReopen > 20000
      ) {
        lastReopen = Date.now();
        try {
          await call("start", { tripId: id });
          status = await call("state");
        } catch (e) {
          badge("기기 GPS 시작 실패 · 앱 위치 권한을 확인해 주세요", true);
          return;
        }
      }
      if (status.activeId !== id) {
        badge("기기 GPS 대기 중 · 운행을 다시 확인해 주세요", true);
        return;
      }
      const merged = [];
      for (let page = 0; page < 20; page++) {
        const data = await call("points", {
          tripId: id,
          afterSeq: nextSeq,
          limit: 180,
        });
        const source = Array.isArray(data?.points) ? data.points : [];
        if (!source.length) break;
        const points = source
          .filter(
            (p) =>
              p &&
              Number.isFinite(p.lat) &&
              Number.isFinite(p.lng) &&
              Number.isFinite(p.t) &&
              Number.isFinite(p.seq),
          )
          .sort((a, b) => a.seq - b.seq);
        if (window.__rsRideApi?.trip?.id !== id || window.__rsRideApi?.paused)
          break;
        if (points.length) {
          merged.push(...points);
          nextSeq = Math.max(nextSeq, ...points.map((p) => p.seq));
        }
        if (source.length < 180) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (
        merged.length &&
        window.__rsRideApi?.trip?.id === id &&
        !window.__rsRideApi?.paused
      ) {
        window.dispatchEvent(
          new CustomEvent("riderspot:native-sqlite-points", {
            detail: { tripId: id, points: merged },
          }),
        );
      }
      const n = Number(status.nativePointCount) || 0;
      const saved = Number(status.gpsLastSavedAt) || 0;
      const age = saved
        ? Math.max(0, Math.floor((Date.now() - saved) / 1000))
        : null;
      const lagging =
        !api.paused &&
        (!status.gpsServiceActive || n === 0 || age === null || age > 35);
      if (api.paused) badge(`운행 일시정지 · 기기에 ${n}개 좌표 저장`);
      else if (lagging)
        badge(
          `GPS 저장 지연 · 기기 ${n}개 좌표 · ${age === null ? "수신 대기" : age + "초 전"} · 재연결 확인`,
          true,
        );
      else badge(`GPS 기록 정상 · 기기 ${n}개 좌표 · 마지막 ${age}초 전`);
      if (
        lagging &&
        !status.gpsServiceActive &&
        document.visibilityState === "visible" &&
        Date.now() - lastReopen > 20000
      ) {
        lastReopen = Date.now();
        try {
          await call("ensure-tracking", { tripId: id });
        } catch (e) {
          if (Date.now() - lastWarning > 60000) {
            console.warn("[RiderSpotGPS41] restart", e);
            lastWarning = Date.now();
          }
        }
      }
    } catch (err) {
      badge("기기 GPS와 연결이 지연되고 있어요 · 앱을 다시 열어 주세요", true);
      if (Date.now() - lastWarning > 60000) {
        console.warn("[RiderSpotGPS41] polling", err);
        lastWarning = Date.now();
      }
    } finally {
      busy = false;
    }
  }

  window.__rsGPS42NativeRead = { call, allPoints, allPointsForDay };
  window.__rsGPS41Poll = poll;
  setInterval(poll, 3000);
  window.addEventListener("focus", poll);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
  setTimeout(poll, 1000);
})();
