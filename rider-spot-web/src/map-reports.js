import { openMapSheet } from './ui-overlays.mjs';
import { createPublicPoiOverlay } from './public-pois-overlay.mjs';
import { isVisibleFacility, VISIBLE_FACILITY } from './facility-visibility.mjs';
(() => {
  "use strict";
  const RS = {
    client: null,
    map: null,
    layer: null,
    reports: { places: [], roads: [] },
    drafts: { places: null, roads: null },
    picker: null,
    pickMap: null,
    pickHandler: null,
    pickPin: null,
    channel: null,
    timer: null,
    generation: 0,
    loaded: false,
    hydrated: new WeakSet(),
  };
  const publicPoiOverlay = createPublicPoiOverlay(openMapSheet);
  const labelFor = { places: "시설 등록", roads: "도로 제보" };
  const esc = (v) =>
    String(v == null ? "" : v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function activeMap() {
    const map = window.__rsMap,
      container = map?.getContainer?.(),
      wrap = document.querySelector(".map-wrap");
    return container?.isConnected && wrap?.contains(container) ? map : null;
  }
  function valid(pt) {
    return (
      !!pt &&
      Number.isFinite(+pt.lat) &&
      Number.isFinite(+pt.lng) &&
      Math.abs(+pt.lat) <= 90 &&
      Math.abs(+pt.lng) <= 180
    );
  }
  function typeOf(form) {
    const t = form?.dataset?.rsForm;
    return t === "places" || t === "roads" ? t : null;
  }
  function collect(form) {
    const type = typeOf(form);
    if (!type) return;
    const d = {};
    for (const [k, v] of new FormData(form)) d[k] = String(v);
    RS.drafts[type] = d;
  }
  function restoreForm(form) {
    if (RS.hydrated.has(form)) return;
    RS.hydrated.add(form);
    const type = typeOf(form),
      draft = RS.drafts[type];
    if (!draft) return;
    for (const [k, v] of Object.entries(draft)) {
      const el = form.elements.namedItem(k);
      if (el && "value" in el) el.value = v;
    }
    const info = form.querySelector(".rs-gps-status");
    if (info && draft.lat && draft.lng)
      info.textContent =
        "지도 선택 완료 · " +
        (+draft.lat).toFixed(5) +
        ", " +
        (+draft.lng).toFixed(5);
  }
  function hydrate() {
    document
      .querySelectorAll(
        'form[data-rs-form="places"],form[data-rs-form="roads"]',
      )
      .forEach(restoreForm);
  }
  function tinyButton(label, listener) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rs33-popup-button";
    button.textContent = label;
    button.addEventListener("click", listener);
    return button;
  }
  function showReportPopup(map, L, record, type, marker) {
    const el = document.createElement("div");
    el.className = "rs-report-popup rs33-report-popup";
    const badge = document.createElement("span");
    badge.className =
      type === "roads" ? "rs-report-badge road" : "rs-report-badge";
    badge.textContent =
      type === "roads" ? "도로 제보 · " + record.category : record.category;
    const title = document.createElement("strong");
    title.textContent = record.title;
    el.append(badge, title);
    if (record.details) {
      const description = document.createElement("p");
      description.textContent = record.details;
      el.append(description);
    }
    const meta = document.createElement("small");
    const when = (value) =>
      new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    meta.textContent =
      (record.nickname || "라이더") +
      " 제보 · " +
      when(record.created_at) +
      " 등록";
    el.append(meta);
    const info = document.createElement("small");
    info.textContent =
      type === "roads"
        ? "유효 기간 " + when(record.expires_at) + "까지"
        : "운영시간은 제보 내용을 확인해 주세요.";
    el.append(info);
    const actions = document.createElement("div");
    actions.className = "rs33-popup-actions";
    const navigation = document.createElement("a");
    navigation.href =
      "https://map.kakao.com/link/to/" +
      encodeURIComponent(record.title) +
      "," +
      Number(record.lat) +
      "," +
      Number(record.lng);
    navigation.target = "_blank";
    navigation.rel = "noopener noreferrer";
    navigation.textContent = "카카오맵 길찾기 ↗";
    if (type === "places") actions.append(navigation);
    let saved = false;
    const bookmark =
      type === "places"
        ? tinyButton("장소 저장", async () => {
            const api = window.__rs33Bookmark;
            if (!api) return;
            bookmark.disabled = true;
            try {
              const user = await api.user();
              if (!user) {
                window.__rsGoToTab?.("account");
                return;
              }
              saved = await api.toggle(user, "place", record.id, saved);
              bookmark.textContent = saved ? "✓ 저장됨" : "장소 저장";
              bookmark.setAttribute("aria-pressed", String(saved));
            } catch {
              bookmark.textContent = "장소 저장 다시 시도";
            } finally {
              bookmark.disabled = false;
            }
          })
        : null;
    if (bookmark) actions.append(bookmark);
    actions.append(
      tinyButton("관련 글 쓰기", () =>
        window.__rs33OpenCommunity?.({
          link: { kind: type, id: record.id, title: record.title },
        }),
      ),
    );
    el.append(actions);
    const links = document.createElement("div");
    links.className = "rs33-popup-links";
    el.append(links);
    marker.on("popupopen", async () => {
      if (!RS.client) return;
      try {
        const column = type === "places" ? "rider_place_id" : "road_report_id";
        const results = await RS.client
          .from("posts")
          .select("id,title")
          .eq(column, record.id)
          .order("created_at", { ascending: false })
          .limit(5);
        if (!results.error) {
          links.replaceChildren();
          if (results.data?.length) {
            const heading = document.createElement("small");
            heading.textContent = "관련 글";
            links.append(heading);
            for (const post of results.data)
              links.append(
                tinyButton(post.title, () =>
                  window.__rs33OpenCommunity?.({ postId: post.id }),
                ),
              );
          }
        }
      } catch {}
      if (bookmark) {
        try {
          const user = await window.__rs33Bookmark?.user();
          saved = user
            ? await window.__rs33Bookmark.get(user, "place", record.id)
            : false;
          bookmark.textContent = saved ? "✓ 저장됨" : "장소 저장";
          bookmark.setAttribute("aria-pressed", String(saved));
        } catch {}
      }
    });
    marker.bindPopup(el, { maxWidth: 300, autoPan: false });
    let closeSheet;
    marker.on("popupopen", () => {
      closeSheet = openMapSheet(el, record.title);
      map.closePopup();
    });
    marker.on("remove", () => closeSheet?.());
  }
  function matchesFacilityLayer(filter, category) {
    return isVisibleFacility(filter, category);
  }
  const facilityPinStyles = new Map([
    [
      "화장실",
      {
        tone: "restroom",
        glyph:
          '<g fill="currentColor" stroke="none"><circle cx="6.4" cy="4.8" r="2"/><path d="M4.4 8h4a1.6 1.6 0 0 1 1.6 1.6v5.1H8.4V21h-4v-6.3H2.8V9.6A1.6 1.6 0 0 1 4.4 8Z"/><circle cx="17.6" cy="4.8" r="2"/><path d="M16.7 8h1.8c.7 0 1.3.5 1.5 1.2l2.2 6.4h-2.6V21h-4v-5.4H13l2.2-6.4c.2-.7.8-1.2 1.5-1.2Z"/></g><path d="M12 3v18" stroke-width="1"/>',
      },
    ],
    [
      "쉼터",
      {
        tone: "shelter",
        glyph:
          '<path d="M3 14h17v3H3zM5 17v4m13-4v4M6 14V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v8M6 10h11"/>',
      },
    ],
    [
      "주유소",
      {
        tone: "fuel",
        glyph:
          '<path d="M3 21h11m-9 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v16M5 10h8m0 3h2a2 2 0 0 1 2 2v2a2 2 0 1 0 4 0v-5a4 4 0 0 0-1-2.6L17.5 7M19 8.5V12h2"/>',
      },
    ],
    [
      "정비소",
      {
        tone: "repair",
        glyph:
          '<path d="M21 5.5l-4.2 4.2-2.5-2.5L18.5 3a5.5 5.5 0 0 0-7 7L4.2 17.3a2.1 2.1 0 0 0 3 3L14.5 13a5.5 5.5 0 0 0 6.5-7.5Z"/>',
      },
    ],
  ]);
  const roadPinStyles = new Map([
    [
      "공사",
      '<path d="M4 10h16v6H4zM7 16v4m10-4v4M7 10V8m10 2V8m-9 8 4-6m2 6 4-6"/>',
    ],
    ["통제", '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 12h9"/>'],
    ["노면 위험", '<path d="m3 20 3-16m12 0 3 16M12 5v3m0 3v2m0 4v3"/>'],
    [
      "사고",
      '<path d="M12 3v2.5m0 13V21M3 12h2.5m13 0H21M5.6 5.6l1.8 1.8m9.2 9.2 1.8 1.8m0-12.8-1.8 1.8m-9.2 9.2-1.8 1.8"/><circle cx="12" cy="12" r="3.5"/>',
    ],
  ]);
  const genericPlaceGlyph =
    '<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>';
  const genericRoadGlyph =
    '<path d="m10.5 4.5-8 13.7A1.9 1.9 0 0 0 4.1 21h15.8a1.9 1.9 0 0 0 1.6-2.8l-8-13.7a1.7 1.7 0 0 0-3 0ZM12 9.5v4m0 3.5h.01"/>';

  function createReportPin(L, type, category) {
    const isRoad = type === "roads";
    const style = isRoad
      ? {
          tone: category === "사고" ? "incident" : "road",
          glyph: roadPinStyles.get(category) || genericRoadGlyph,
        }
      : facilityPinStyles.get(category) || {
          tone: "other",
          glyph: genericPlaceGlyph,
        };
    const html = `<div class="rs-report-pin-art" aria-hidden="true">
  <svg class="rs-report-pin-shell" viewBox="0 0 36 38" focusable="false"><path d="M10 2h16q8 0 8 8v12q0 8-8 8h-2l-4.5 5.5q-1.5 1.9-3 0L12 30h-2q-8 0-8-8V10q0-8 8-8Z"/></svg>
  <svg class="rs-report-pin-glyph" viewBox="0 0 24 24" focusable="false">${style.glyph}</svg>
 </div>`;
    return L.divIcon({
      className: "rs-report-pin rs-category-pin rs-category-pin--" + style.tone,
      html,
      iconSize: [36, 38],
      iconAnchor: [18, 37],
      popupAnchor: [0, -35],
    });
  }
  function drawReports() {
    const map = activeMap(),
      L = window.__rsLeaflet;
    if (!map || map !== RS.map || !L || !RS.layer) return;
    const filter =
      map.getContainer().closest(".map-wrap")?.dataset.rs33Layer || "places";
    if (!["places", "shelters"].includes(filter)) publicPoiOverlay.clear();
    const records =
      filter === "riders"
        ? []
        : filter === "roads"
          ? RS.reports.roads.filter(
              (row) => Date.parse(row.expires_at) > Date.now(),
            )
          : RS.reports.places.filter((row) =>
              matchesFacilityLayer(filter, row.category),
            );
    const stateKey = JSON.stringify([
      filter,
      Boolean(window.__rsRideApi?.sharing),
      window.__rsMapRiders?.length || 0,
      records.map((r) => [
        r.id,
        r.category,
        r.title,
        r.details,
        r.expires_at,
        r.lat,
        r.lng,
      ]),
    ]);
    if (RS.renderedKey === stateKey && !window.__rs33MapTarget) return;
    RS.renderedKey = stateKey;
    RS.layer.clearLayers();
    for (const r of records) {
      const type = filter === "roads" ? "roads" : "places";
      if (!valid(r)) continue;
      const marker = L.marker([+r.lat, +r.lng], {
        icon: createReportPin(L, type, r.category),
      }).addTo(RS.layer);
      marker
        .getElement()
        ?.setAttribute("aria-label", r.category + ": " + r.title);
      const tooltip = document.createElement("span");
      tooltip.textContent = r.category + " · " + r.title;
      marker.bindTooltip(tooltip, {
        direction: "top",
        offset: [0, -36],
        opacity: 0.94,
      });
      showReportPopup(map, L, r, type, marker);
      if (window.__rs33MapTarget?.id === r.id) {
        window.__rs33MapTarget = null;
        marker.openPopup();
      }
    }
    const legend = document.getElementById("rs-report-legend");
    if (legend) {
      const share = Boolean(window.__rsRideApi?.sharing);
      legend.textContent =
        filter === "riders"
          ? share
            ? "공유 중인 라이더 " + (window.__rsMapRiders?.length || 0) + "명"
            : "위치 공유를 켜면 주변 라이더를 볼 수 있어요."
          : filter === "roads"
            ? "이 화면의 도로 제보 " + records.length + "건"
            : "화장실 " + records.length + "곳";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = filter === "roads" ? "제보 올리기" : "시설 등록";
      button.className = "rs33-map-register";
      button.onclick = () =>
        window.__rsOpenTool?.(filter === "roads" ? "roads" : "places");
      if (filter !== "riders") legend.append(button);
    }
  }
  async function fetchType(type, bounds, sequence) {
    const output = [],
      pageSize = 400,
      maxItems = 3200;
    for (let from = 0; from < maxItems; from += pageSize) {
      if (sequence !== RS.generation) return null;
      const table = type === "places" ? "rider_places" : "road_reports";
      let q = RS.client
        .from(table)
        .select(
          type === "places"
            ? "id,user_id,nickname,category,title,details,lat,lng,created_at"
            : "id,user_id,nickname,category,title,details,lat,lng,created_at,expires_at",
        )
        .gte("lat", bounds.south)
        .lte("lat", bounds.north);
      if (bounds.east - bounds.west < 360) {
        if (bounds.west >= -180 && bounds.east <= 180)
          q = q.gte("lng", bounds.west).lte("lng", bounds.east);
      }
      if (type === "places") q = q.eq("category", VISIBLE_FACILITY);
      if (type === "roads") q = q.gt("expires_at", new Date().toISOString());
      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      output.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return output;
  }
  async function fetchVisible() {
    const map = activeMap();
    if (!RS.client || !map || RS.map !== map) return;
    const token = ++RS.generation,
      b = map.getBounds(),
      bounds = {
        south: Math.max(-90, b.getSouth()),
        north: Math.min(90, b.getNorth()),
        west: b.getWest(),
        east: b.getEast(),
      };
    try {
      const data = await Promise.allSettled([
        fetchType("places", bounds, token),
        fetchType("roads", bounds, token),
      ]);
      if (token !== RS.generation || RS.map !== activeMap()) return;
      for (let i = 0; i < data.length; i++) {
        if (data[i].status === "fulfilled" && Array.isArray(data[i].value))
          RS.reports[i === 0 ? "places" : "roads"] = data[i].value;
        else if (data[i].status === "rejected")
          console.warn(
            "제보 지도를 불러오지 못했어요:",
            data[i].reason?.message || data[i].reason,
          );
      }
      RS.loaded = true;
      drawReports();
      publicPoiOverlay.refresh({
        map, L: window.__rsLeaflet, client: RS.client,
        riderPlaces: RS.reports.places,
        filter: map.getContainer().closest(".map-wrap")?.dataset.rs33Layer || "places",
      });
    } catch (err) {
      console.warn("제보 지도 조회:", err?.message || err);
    }
  }
  function scheduleFetch(delay = 350) {
    if (RS.timer) clearTimeout(RS.timer);
    RS.timer = setTimeout(fetchVisible, delay);
  }
  function setPin(map, latlng) {
    if (!RS.picker || !valid(latlng)) return;
    const coords = {
      lat: +(+latlng.lat).toFixed(6),
      lng: +(+latlng.lng).toFixed(6),
    };
    RS.picker.coords = coords;
    if (RS.pickPin && RS.pickMap === map)
      RS.pickPin.setLatLng([coords.lat, coords.lng]);
    else {
      if (RS.pickPin && RS.pickMap) {
        try {
          RS.pickMap.removeLayer(RS.pickPin);
        } catch (_) {}
      }
      const L = window.__rsLeaflet;
      RS.pickPin = L.marker([coords.lat, coords.lng], {
        draggable: true,
        zIndexOffset: 2000,
        icon: L.divIcon({
          className: "rs-map-picker-pin",
          html: "<span>⌖</span>",
          iconSize: [42, 46],
          iconAnchor: [21, 43],
        }),
      }).addTo(map);
      RS.pickPin.on("dragend", () => {
        const p = RS.pickPin.getLatLng();
        setPin(map, p);
      });
    }
    updatePickerInfo();
  }
  function updatePickerInfo() {
    const box = document.getElementById("rs-map-picker"),
      coords = RS.picker?.coords;
    if (!box) return;
    const info = box.querySelector("[data-rs-pick-status]"),
      button = box.querySelector("[data-rs-pick-confirm]");
    if (info)
      info.textContent = valid(coords)
        ? "선택 좌표 " +
          (+coords.lat).toFixed(5) +
          ", " +
          (+coords.lng).toFixed(5)
        : "지도를 터치해 위치를 찍어 주세요";
    if (button) button.disabled = !valid(coords);
  }
  function releasePicker() {
    if (RS.pickMap && RS.pickHandler) {
      try {
        RS.pickMap.off("click", RS.pickHandler);
      } catch (_) {}
    }
    if (RS.pickMap && RS.pickPin) {
      try {
        RS.pickMap.removeLayer(RS.pickPin);
      } catch (_) {}
    }
    RS.pickMap = null;
    RS.pickHandler = null;
    RS.pickPin = null;
    document.querySelectorAll("#rs-map-picker").forEach((x) => x.remove());
    document.querySelector(".map-wrap")?.classList.remove("rs-map-picking");
  }
  function finishPicker(save) {
    const pick = RS.picker;
    if (!pick) return;
    if (save && !valid(pick.coords)) return;
    if (save) {
      RS.drafts[pick.type] = Object.assign({}, RS.drafts[pick.type] || {}, {
        lat: String(pick.coords.lat),
        lng: String(pick.coords.lng),
      });
    }
    RS.picker = null;
    releasePicker();
    window.__rsGoToTab?.("tools");
  }
  function buildPicker(map) {
    const wrap = document.querySelector(".map-wrap");
    if (!RS.picker || !wrap) return;
    if (RS.pickMap !== map) {
      releasePicker();
      RS.pickMap = map;
      RS.pickHandler = (e) => setPin(map, e.latlng);
      map.on("click", RS.pickHandler);
      if (valid(RS.picker.coords)) {
        setTimeout(() => {
          if (RS.picker && RS.pickMap === map) {
            map.setView(
              [RS.picker.coords.lat, RS.picker.coords.lng],
              Math.max(16, map.getZoom()),
            );
            setPin(map, RS.picker.coords);
          }
        }, 650);
      }
    }
    wrap.classList.add("rs-map-picking");
    if (wrap.querySelector("#rs-map-picker")) return;
    const panel = document.createElement("section");
    panel.id = "rs-map-picker";
    panel.setAttribute("aria-label", "지도에서 위치 선택");
    panel.innerHTML =
      '<div class="rs-map-picker-title"><span class="rs-map-picker-logo">⌖</span><div><strong>지도에서 위치 선택</strong><small>원하는 지점을 누르거나 핀을 드래그하세요</small></div></div><div class="rs-map-picker-actions"><span data-rs-pick-status>지도를 터치해 위치를 찍어 주세요</span><div><button type="button" data-rs-pick-cancel>취소</button><button type="button" data-rs-pick-confirm disabled>이 위치로 등록</button></div></div>';
    panel
      .querySelector("[data-rs-pick-cancel]")
      .addEventListener("click", () => finishPicker(false));
    panel
      .querySelector("[data-rs-pick-confirm]")
      .addEventListener("click", () => finishPicker(true));
    wrap.append(panel);
    updatePickerInfo();
  }
  function startPicker(form) {
    const type = typeOf(form);
    if (!type) return;
    collect(form);
    const d = RS.drafts[type] || {};
    const pt =
      d.lat && d.lng ? { lat: Number(d.lat), lng: Number(d.lng) } : null;
    RS.picker = { type, coords: valid(pt) ? pt : null };
    window.__rsGoToTab?.("nearby");
    setTimeout(install, 100);
  }
  function focusTarget() {
    const map = activeMap(),
      target = window.__rs33MapTarget;
    if (!map || !target || RS.map !== map || RS.focusId === target.id) return;
    RS.focusId = target.id;
    window.__rs33MapTarget = null;
    window.__rsPendingMapCenter = null;
    map.setView([target.lat, target.lng], Math.max(16, map.getZoom()));
    scheduleFetch(30);
  }
  function install() {
    hydrate();
    const map = activeMap(),
      L = window.__rsLeaflet;
    if (!map || !L) return;
    if (RS.map !== map) {
      RS.map = map;
      RS.focusId = null;
      RS.renderedKey = null;
      RS.layer = L.layerGroup().addTo(map);
      RS.reports = { places: [], roads: [] };
      RS.loaded = false;
      map.on("moveend", () => {
        if (activeMap() === map) scheduleFetch(350);
      });
      scheduleFetch(60);
    }
    const wrap = document.querySelector(".map-wrap");
    if (wrap && !wrap.querySelector("#rs-report-legend")) {
      const legend = document.createElement("div");
      legend.id = "rs-report-legend";
      legend.innerHTML =
        '<span class="rs-dot-green"></span> 화장실 <span class="rs-dot-amber"></span> 도로';
      wrap.append(legend);
    }
    if (RS.picker) buildPicker(map);
    else if (RS.pickMap) releasePicker();
    focusTarget();
  }
  function afterSaved(e) {
    const type = e.detail?.type;
    if (type === "places" || type === "roads") {
      RS.drafts[type] = null;
      scheduleFetch(80);
    }
  }
  function initializeClient() {
    const client = window.__rsClient;
    if (!client || RS.client) return;
    RS.client = client;
    try {
      RS.channel = client
        .channel("rider-public-reports-v12")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rider_places" },
          () => scheduleFetch(1000),
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "road_reports" },
          () => scheduleFetch(1000),
        )
        .subscribe();
    } catch (err) {
      console.warn("제보 실시간 구독:", err);
    }
    scheduleFetch(100);
  }
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("button[data-rs-pick-map]");
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const form = btn.closest("form");
        if (typeOf(form)) startPicker(form);
      }
    },
    true,
  );
  document.addEventListener(
    "input",
    (e) => {
      const form = e.target.closest(
        'form[data-rs-form="places"],form[data-rs-form="roads"]',
      );
      if (form) collect(form);
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      const form = e.target.closest(
        'form[data-rs-form="places"],form[data-rs-form="roads"]',
      );
      if (form) collect(form);
    },
    true,
  );
  window.addEventListener("riderspot:report-saved", afterSaved);
  window.addEventListener("riderspot:map", () => {
    install();
    scheduleFetch(450);
  });
  window.addEventListener("riderspot:layer-changed", () => {
    install();
    drawReports();
    scheduleFetch(100);
  });
  window.addEventListener("riderspot:map-target", () => {
    RS.focusId = null;
    install();
    focusTarget();
  });
  setInterval(() => {
    if (activeMap()) {
      const old = RS.reports.roads;
      RS.reports.roads = old.filter(
        (row) => Date.parse(row.expires_at) > Date.now(),
      );
      if (old.length !== RS.reports.roads.length) drawReports();
    }
  }, 15000);
  function boot() {
    new MutationObserver(() => {
      install();
      initializeClient();
    }).observe(document.body, { childList: true, subtree: true });
    setInterval(() => {
      install();
      initializeClient();
    }, 900);
    install();
    initializeClient();
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
