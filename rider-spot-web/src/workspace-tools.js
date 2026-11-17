import { iconMarkup } from "./ui.mjs";
(function () {
  "use strict";
  const TABS = [
    ["places", "편의시설", "⌖"],
    ["earnings", "수익 기록", "₩"],
    ["fuel", "주유 기록", "⛽"],
    ["maintenance", "정비 관리", "⚙"],
    ["analysis", "수익 분석", "▥"],
    ["roads", "도로 제보", "⚠"],
    ["sos", "도움 요청", "SOS"],
    ["shortcuts", "빠른 도구", "↗"],
  ];
  const S = {
    client: null,
    user: null,
    active: false,
    tab: "hub",
    data: {
      places: [],
      earnings: [],
      fuel: [],
      maintenance: [],
      trips: [],
      roads: [],
      sos: [],
      replies: [],
      settings: null,
    },
    selectedSOS: null,
    overlay: null,
    overlayMap: null,
    busy: false,
    lastError: "",
    mapEnabled: true,
  };
  const $ = (s, root = document) => root.querySelector(s);
  const H = (v) =>
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
  const M = (v) =>
    new Intl.NumberFormat("ko-KR").format(Math.round(Number(v) || 0)) + "원";
  const N = (v) => Number(v) || 0;
  const nowDate = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const ago = (v) => {
    const n = Date.now() - new Date(v).getTime();
    return n < 60000
      ? "방금"
      : n < 3600000
        ? Math.floor(n / 60000) + "분 전"
        : n < 86400000
          ? Math.floor(n / 3600000) + "시간 전"
          : new Date(v).toLocaleDateString("ko-KR");
  };
  const activeSOS = (r) =>
    r && r.status === "active" && new Date(r.expires_at).getTime() > Date.now();
  const nick = () =>
    String(window.__rsDisplayName?.(S.user) || "라이더").slice(0, 24);
  const card = (heading, body, sub) =>
    '<article class="rs-card"><h3>' +
    H(heading) +
    "</h3>" +
    (sub ? '<p class="rs-sub">' + H(sub) + "</p>" : "") +
    body +
    "</article>";
  const empty = (text) => '<p class="rs-empty">' + H(text) + "</p>";
  const fmtFloat = (x, n = 1) => N(x).toFixed(n);
  const REPLY_EMPTY =
    "아직 답글이 없어요. 도움이 가능하다면 한마디 남겨주세요.";
  let root;
  function msg(text, isError = false) {
    S.lastError = text;
    const el = $("#rs-message");
    if (el) {
      el.textContent = text;
      el.hidden = false;
      el.classList.toggle("rs-error", isError);
    }
  }
  async function db(promise) {
    const result = await promise;
    if (result.error) throw result.error;
    return result.data;
  }
  function requireUser() {
    if (S.user) return true;
    msg(
      "로그인 후 이용할 수 있어요. 내 정보에서 Google 또는 이메일로 로그인해 주세요.",
      true,
    );
    return false;
  }
  function tabHeader(title, subtitle) {
    return (
      '<div class="rs-work-breadcrumb"><button type="button" data-rs-hub>‹ 업무 목록</button><span class="rs-work-crumb">업무 / ' +
      H(title) +
      '</span></div><div class="rs-panel-head rs33-work-subhead"><div class="rs-panel-heading"><h2>' +
      H(title) +
      "</h2><p>" +
      H(subtitle) +
      "</p></div></div>"
    );
  }
  function tabbar() {
    return (
      '<nav class="rs-tabs" aria-label="라이더 도구 메뉴">' +
      TABS.map(
        ([id, label, icon]) =>
          '<button type="button" data-rs-tab="' +
          id +
          '" class="' +
          (id === S.tab ? "current" : "") +
          '" aria-current="' +
          (id === S.tab ? "page" : "false") +
          '"><span class="rs-tab-icon">' +
          icon +
          "</span><span>" +
          label +
          "</span></button>",
      ).join("") +
      "</nav>"
    );
  }
  function mapCard(title, subtitle, id) {
    return (
      '<button class="rs-place-row" data-rs-detail="' +
      H(id) +
      '"><strong>' +
      H(title) +
      "</strong><small>" +
      H(subtitle) +
      "</small><span>›</span></button>"
    );
  }
  function usePointForm() {
    return '<div class="rs-map-point-actions"><button type="button" data-rs-pick-map class="rs-select-map-location">⌖ 지도에서 위치 선택하기</button><span class="rs-map-point-separator">또는</span></div><div class="rs-gps"><button type="button" data-rs-gps>◎ 내 현재 위치 사용</button><span class="rs-gps-status">등록 위치는 모든 지도 이용자에게 보여요.</span></div><input type="hidden" name="lat" required><input type="hidden" name="lng" required>';
  }
  function formField(label, name, type, opts) {
    opts = opts || {};
    return (
      '<label class="rs-field"><span>' +
      H(label) +
      '</span><input name="' +
      name +
      '" type="' +
      (type || "text") +
      '" ' +
      (opts.required ? "required " : "") +
      (opts.min != null ? 'min="' + opts.min + '" ' : "") +
      (opts.max != null ? 'max="' + opts.max + '" ' : "") +
      (opts.step ? 'step="' + opts.step + '" ' : "") +
      (opts.maxLength ? 'maxlength="' + opts.maxLength + '" ' : "") +
      'placeholder="' +
      H(opts.placeholder || "") +
      '" value="' +
      H(opts.value == null ? "" : opts.value) +
      '"></label>'
    );
  }
  function textarea(label, name, placeholder, maxLength, required) {
    const sos = name === "message" && maxLength === 600;
    return (
      '<label class="rs-field"><span>' +
      H(label) +
      '</span><textarea name="' +
      name +
      '" maxlength="' +
      maxLength +
      '" ' +
      (sos ? 'minlength="5" ' : "") +
      'placeholder="' +
      H(placeholder) +
      '" ' +
      (required ? "required" : "") +
      "></textarea>" +
      (sos
        ? '<small data-rs-count class="rs-length-hint">최소 5자 · 현재 0자 / 600자</small>'
        : "") +
      "</label>"
    );
  }
  function selectField(label, name, options) {
    return (
      '<label class="rs-field"><span>' +
      H(label) +
      '</span><select name="' +
      name +
      '">' +
      options
        .map((o) => '<option value="' + H(o) + '">' + H(o) + "</option>")
        .join("") +
      "</select></label>"
    );
  }
  function summaryTile(label, val) {
    return (
      '<div class="rs-stat"><small>' +
      H(label) +
      "</small><strong>" +
      H(val) +
      "</strong></div>"
    );
  }
  function delButton(table, id) {
    return (
      '<button class="rs-mini danger" data-rs-del="' +
      table +
      '" data-rs-id="' +
      H(id) +
      '">삭제</button>'
    );
  }
  function renderPlaces() {
    const rows = S.data.places
      .slice(0, 60)
      .map(
        (p) =>
          '<div class="rs-list-row"><div><span class="rs-chip">' +
          H(p.category) +
          "</span><strong>" +
          H(p.title) +
          "</strong><p>" +
          H(p.details || "정보 없음") +
          "</p><small>" +
          H(p.nickname) +
          " · " +
          ago(p.created_at) +
          '</small></div><div class="rs-row-actions"><button data-rs-pan="' +
          H(p.lat) +
          "," +
          H(p.lng) +
          '" class="rs-mini">지도</button>' +
          (p.user_id === S.user?.id ? delButton("rider_places", p.id) : "") +
          "</div></div>",
      )
      .join("");
    return (
      card(
        "라이더 편의시설",
        '<p class="rs-small">쉼터·화장실, 주유소, 정비소를 서로 제보해요. 검증되지 않은 사용자 제보예요.</p><form data-rs-form="places" class="rs-form">' +
          '<label class="rs-field"><span>시설 종류</span><select name="category"><optgroup label="쉼터·화장실"><option>화장실</option><option>쉼터</option></optgroup><option>주유소</option><option>정비소</option><option>기타</option></select></label>' +
          formField("장소 이름", "title", "text", {
            required: true,
            maxLength: 80,
            placeholder: "예: 주차장 옆 공용 화장실",
          }) +
          textarea(
            "이용 팁",
            "details",
            "이용 가능 시간이나 위치 단서",
            400,
            false,
          ) +
          usePointForm() +
          '<button class="rs-primary" type="submit">시설 등록</button></form>',
      ) +
      card(
        "등록된 시설 · " + S.data.places.length + "곳",
        rows || empty("아직 제보가 없어요. 첫 번째 시설을 등록해 주세요."),
      )
    );
  }
  function renderEarnings() {
    const all = S.data.earnings,
      month = nowDate().slice(0, 7),
      selected = all.filter((e) => String(e.work_date).startsWith(month));
    const gross = selected.reduce((a, e) => a + N(e.gross_won), 0),
      cost = selected.reduce((a, e) => a + N(e.expenses_won), 0),
      hours = selected.reduce((a, e) => a + N(e.hours), 0),
      visible = S.platform
        ? all.filter(
            (row) =>
              row.platform === S.platform ||
              (S.platform === "배민" && row.platform === "배민커넥트"),
          )
        : all;
    const rows = visible
      .slice(0, 30)
      .map(
        (e) =>
          '<div class="rs-list-row"><div><strong>' +
          H(e.work_date) +
          " · " +
          H(e.platform) +
          "</strong><p>" +
          M(e.gross_won) +
          " · 비용 " +
          M(e.expenses_won) +
          "</p><small>" +
          N(e.deliveries) +
          "건 · " +
          fmtFloat(e.hours) +
          "시간 · " +
          fmtFloat(e.distance_km) +
          'km</small></div><div class="rs-row-actions"><button type="button" class="rs-mini" data-rs-paid="' +
          H(e.id) +
          '" aria-pressed="' +
          Boolean(e.paid_at) +
          '">' +
          (e.paid_at ? "입금 확인 " + H(e.paid_at) : "입금 확인하기") +
          "</button>" +
          delButton("rider_earnings", e.id) +
          "</div></div>",
      )
      .join("");
    return (
      (S.platform
        ? '<div class="rs33-platform-filter">' +
          H(S.platform) +
          ' 수익 <button type="button" data-rs-clear-platform>모든 플랫폼</button></div>'
        : "") +
      '<div class="rs-stats">' +
      summaryTile("이번 달 매출", M(gross)) +
      summaryTile("직접 입력 비용 차감액", M(gross - cost)) +
      summaryTile(
        "입력 기록 시간당",
        hours ? M((gross - cost) / hours) : "기록 없음",
      ) +
      "</div>" +
      card(
        "수익 기록",
        '<p class="rs-small">배민·쿠팡 수입을 따로 입력해도 합산돼요. 앱 내 자동 정산 연동은 아직 아니에요. 주유비는 주유 기록에, 정비비는 정비 관리에 적어 주세요.</p><form class="rs-form" data-rs-form="earnings">' +
          formField("날짜", "work_date", "date", {
            required: true,
            value: nowDate(),
          }) +
          selectField("플랫폼", "platform", ["쿠팡이츠", "배민", "기타"]) +
          '<div class="rs-two">' +
          formField("배달 건수", "deliveries", "number", {
            required: true,
            min: 0,
            max: 300,
            value: 0,
          }) +
          formField("매출 (원)", "gross_won", "number", {
            required: true,
            min: 0,
            value: "",
          }) +
          "</div>" +
          '<div class="rs-two">' +
          formField("기타 비용 (주유·정비 제외)", "expenses_won", "number", {
            required: true,
            min: 0,
            value: 0,
          }) +
          formField("운행 시간", "hours", "number", {
            required: true,
            min: 0,
            max: 24,
            step: "0.1",
            value: "",
          }) +
          "</div>" +
          formField("주행 거리 (km)", "distance_km", "number", {
            required: true,
            min: 0,
            max: 1500,
            step: "0.1",
            value: 0,
          }) +
          formField("메모", "note", "text", {
            maxLength: 300,
            placeholder: "선택 사항",
          }) +
          '<button class="rs-primary" type="submit">수익 기록 저장</button></form>',
      ) +
      '<button type="button" class="rs-fuel-analysis" data-rs-tab="fuel">⛽ 주유비 빠르게 기록하기</button>' +
      card("최근 수익 기록", rows || empty("아직 수익 기록이 없어요."))
    );
  }

  function renderFuel() {
    const all = Array.isArray(S.data.fuel) ? S.data.fuel : [],
      month = nowDate().slice(0, 7),
      selected = all.filter((x) => String(x.fueled_on).startsWith(month));
    const total = selected.reduce((n, x) => n + N(x.cost_won), 0),
      sumLiters = selected.reduce((n, x) => n + N(x.liters), 0),
      rate = fuelRate(all);
    const entries = all
      .slice(0, 45)
      .map(
        (x) =>
          '<div class="rs-fuel-item"><span class="rs-fuel-icon">⛽</span><div class="rs-fuel-info"><strong>' +
          H(x.fueled_on) +
          "</strong><small>" +
          (x.liters != null
            ? new Intl.NumberFormat("ko-KR", {
                maximumFractionDigits: 3,
              }).format(x.liters) + "L · "
            : "") +
          (x.odometer_km != null
            ? new Intl.NumberFormat("ko-KR").format(x.odometer_km) + "km"
            : "계기판 미입력") +
          "</small>" +
          (x.note ? "<p>" + H(x.note) + "</p>" : "") +
          '</div><div class="rs-fuel-end"><strong>' +
          M(x.cost_won) +
          "</strong>" +
          delButton("rider_fuel_logs", x.id) +
          "</div></div>",
      )
      .join("");
    return (
      '<div class="rs-fuel-page">' +
      '<section class="rs-fuel-summary"><div><small>이번 달 기록된 주유비</small><strong>' +
      M(total) +
      "</strong><span>최근 조회 기록 기준 · " +
      selected.length +
      "회</span></div><div><small>기록된 주유량</small><strong>" +
      (sumLiters
        ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 }).format(
            sumLiters,
          ) + "L"
        : "—") +
      "</strong><span>리터 입력은 선택</span></div></section>" +
      (rate
        ? '<p class="rs33-muted">최근 확인 가능한 연비 ' +
          (rate.distance / rate.liters).toFixed(1) +
          "km/L · 가득 주유 사이 기록 기준</p>"
        : "") +
      card(
        "주유 빠르게 기록",
        '<p class="rs-fuel-hint">주유비를 한 번만 입력하면 월간 수익 분석에 자동 반영돼요.</p><form class="rs-form rs-fuel-form" data-rs-form="fuel">' +
          formField("주유 금액 (원)", "cost_won", "number", {
            required: true,
            min: 1,
            max: 1000000000,
            placeholder: "예: 8000",
          }) +
          '<details class="rs-fuel-optional"><summary>날짜 · 주유량 · 계기판 · 메모 <span>선택</span></summary><div>' +
          formField("주유 날짜", "fueled_on", "date", {
            required: true,
            value: nowDate(),
          }) +
          '<div class="rs-two">' +
          formField("주유량 (L)", "liters", "number", {
            min: 0.001,
            max: 150,
            step: "0.001",
            placeholder: "예: 2.4",
          }) +
          formField("계기판 거리 (km)", "odometer_km", "number", {
            min: 0,
            max: 9999999,
            step: 1,
            placeholder: "선택",
          }) +
          "</div>" +
          '<label class="rs-check"><input type="checkbox" name="full_tank"> <span>가득 주유</span></label>' +
          formField("메모", "note", "text", {
            maxLength: 300,
            placeholder: "선택 사항",
          }) +
          '</div></details><button class="rs-primary rs-fuel-save" type="submit">＋ 주유 기록 저장</button></form><p class="rs-fuel-foot">정비비는 정비 관리에서 따로 입력해요. 계기판 숫자는 주유 기록에만 남으며 차량의 현재 주행거리를 자동으로 변경하지 않아요.</p>',
      ) +
      card(
        "최근 주유 기록",
        entries || '<p class="rs-small">아직 저장된 주유 기록이 없어요.</p>',
      ) +
      '<button type="button" class="rs-fuel-analysis" data-rs-tab="analysis">월별 주유비와 순수익 확인 ›</button>' +
      "</div>"
    );
  }

  function renderMaintenance() {
    return "<section id=rs-maint-ui></section>";
  }
  function renderAnalysis() {
    return "<section id=rs-analysis-ui></section>";
  }
  function renderRoads() {
    const rows = S.data.roads
      .filter((r) => new Date(r.expires_at) > new Date())
      .map(
        (r) =>
          '<div class="rs-list-row"><div><span class="rs-chip rs-warn">' +
          H(r.category) +
          "</span><strong>" +
          H(r.title) +
          "</strong><p>" +
          H(r.details) +
          "</p><small>" +
          ago(r.created_at) +
          " · " +
          new Date(r.expires_at).toLocaleString("ko-KR") +
          ' 만료</small></div><div class="rs-row-actions"><button class="rs-mini" data-rs-pan="' +
          H(r.lat) +
          "," +
          H(r.lng) +
          '">지도</button><button type="button" class="rs-mini" data-rs-linked-road="' +
          H(r.id) +
          '">관련 글 쓰기</button>' +
          (r.user_id === S.user?.id ? delButton("road_reports", r.id) : "") +
          "</div></div>",
      )
      .join("");
    return (
      card(
        "현장 도로 제보",
        '<p class="rs-small">공사, 통제, 노면 위험 등을 다른 라이더에게 알려줘요. 정확한 좌표가 표시되므로 주거지·고객 정보는 등록하지 마세요.</p><form class="rs-form" data-rs-form="roads">' +
          selectField("제보 유형", "category", [
            "공사",
            "통제",
            "노면 위험",
            "사고",
            "기타",
          ]) +
          formField("제보 제목", "title", "text", {
            required: true,
            maxLength: 80,
            placeholder: "예: 좌측 차로 공사 중",
          }) +
          textarea("상세 내용", "details", "우회 동선, 위험 요인", 400, false) +
          selectField("제보 유효 시간", "hours", ["6", "12", "24"]) +
          usePointForm() +
          '<button class="rs-primary" type="submit">도로 상황 제보</button></form>',
      ) +
      card(
        "유효한 제보 · " + S.data.roads.length + "건",
        rows || empty("현재 등록된 도로 제보가 없어요."),
      )
    );
  }
  function renderSos() {
    const active = S.data.sos.filter(activeSOS),
      mine = active.find((r) => r.user_id === S.user?.id);
    const content =
      '<div class="rs-sos-intro"><div class="rs-sos-intro-mark">SOS</div><div><strong>근처 라이더에게 도움이 필요할 때</strong><p>상황을 공유하고 답글로 도움을 주고받아요. 위치 공유는 선택 사항이며, 전문 긴급 구조 서비스는 아닙니다.</p></div></div>';
    let form = mine
      ? '<div class="rs-current-sos"><strong>내 SOS 진행 중 · ' +
        H(mine.category) +
        "</strong><p>" +
        H(mine.message) +
        "</p><small>만료 " +
        new Date(mine.expires_at).toLocaleString("ko-KR") +
        '</small><button class="rs-secondary" data-rs-resolve="' +
        H(mine.id) +
        '">도움 요청 종료</button></div>'
      : '<form data-rs-form="sos" class="rs-form">' +
        selectField("도움이 필요한 상황", "category", [
          "사고",
          "차량 고장",
          "몸이 아픔",
          "기타 도움",
        ]) +
        textarea(
          "어떤 도움이 필요한가요? (5자 이상)",
          "message",
          "예: 오토바이가 넘어져서 함께 세워주실 분이 필요합니다.",
          600,
          true,
        ) +
        formField("대략적인 지역 (선택)", "area_label", "text", {
          maxLength: 60,
          placeholder: "예: 첨단지구 근처",
        }) +
        '<label class="rs-check"><input type="checkbox" name="show_on_map" checked> <span>위치 공유를 켜고 지도에 SOS 표시하기</span></label><p class="rs-small">지도 표시를 선택하면 주변 라이더가 현재 위치를 볼 수 있어요. 게시판에는 정확한 좌표를 적지 마세요. 요청은 2시간 후 자동 만료돼요.</p><button class="rs-primary rs-danger" type="submit">SOS 도움 요청 게시하기</button></form>';
    const list = active
      .map(
        (x) =>
          '<button class="rs-sos-row" data-rs-open-sos="' +
          H(x.id) +
          '"><span class="rs-sos-pill">SOS</span><span><strong>' +
          H(x.category) +
          " · " +
          H(x.nickname) +
          "</strong><small>" +
          H(x.area_label || "지역 미입력") +
          " · " +
          ago(x.created_at) +
          "</small><em>" +
          H(x.message.slice(0, 80)) +
          "</em></span><b>›</b></button>",
      )
      .join("");
    const selected = S.data.sos.find((x) => x.id === S.selectedSOS);
    let detail = "";
    if (selected) {
      const replies = S.data.replies
        .filter((r) => r.sos_id === selected.id)
        .map(
          (r) =>
            '<div class="rs-reply"><strong>' +
            H(r.nickname) +
            "</strong><p>" +
            H(r.message) +
            "</p><small>" +
            ago(r.created_at) +
            "</small></div>",
        )
        .join("");
      detail = card(
        "도움 요청 상세",
        '<button class="rs-mini" data-rs-back-sos>← 목록으로</button><p><strong>' +
          H(selected.category) +
          " · " +
          H(selected.nickname) +
          "</strong></p><p>" +
          H(selected.message) +
          '</p><p class="rs-small">' +
          H(selected.area_label || "지역 미입력") +
          " · " +
          ago(selected.created_at) +
          "</p>" +
          (activeSOS(selected)
            ? '<span class="rs-chip rs-warn">도움 요청 중</span>'
            : '<span class="rs-chip">종료 또는 만료</span>') +
          (selected.user_id === S.user?.id && activeSOS(selected)
            ? '<button class="rs-secondary" data-rs-resolve="' +
              H(selected.id) +
              '">내 SOS 종료하기</button>'
            : "") +
          "<h4>답글</h4>" +
          (replies || empty(REPLY_EMPTY)) +
          (activeSOS(selected)
            ? '<form class="rs-form" data-rs-form="reply"><input type="hidden" name="sos_id" value="' +
              H(selected.id) +
              '">' +
              textarea(
                "도움 제안 · 답글",
                "message",
                "연락처·개인정보 대신 필요한 내용만 남겨 주세요.",
                500,
                true,
              ) +
              '<button class="rs-primary">답글 등록</button></form>'
            : ""),
      );
    }
    return (
      content +
      card("SOS 요청 등록", form) +
      card(
        "라이더 도움 게시판 · 진행 중 " + active.length + "건",
        list || empty("현재 진행 중인 SOS가 없어요."),
      ) +
      detail
    );
  }
  function renderShortcuts() {
    const phrases = [
      "문 앞에 안전하게 놓았습니다. 감사합니다.",
      "매장에 도착했습니다. 조리 완료까지 잠시 대기하겠습니다.",
      "도로 상황으로 도착이 조금 지연될 수 있습니다. 양해 부탁드립니다.",
      "도착했습니다. 수령 가능한 장소를 알려주세요.",
    ];
    return (
      (S.user
        ? card(
        "내 연락 도구",
        '<p class="rs-small">문자 전송은 직접 확인 후 보내며, 연락처는 본인만 조회할 수 있도록 수익 기록 저장해요.</p><form data-rs-form="settings" class="rs-form">' +
          formField("긴급 연락처 번호", "emergency_phone", "tel", {
            maxLength: 24,
            value: S.data.settings?.emergency_phone || "",
            placeholder: "예: 01012345678",
          }) +
          '<button class="rs-primary">연락처 저장</button></form><button class="rs-secondary" data-rs-sms>현재 위치 문자 준비</button>',
      )
      : card("내 연락 도구", '<p class="rs-small">계정으로 로그인하면 긴급 연락처를 등록할 수 있어요.</p><button type="button" data-rs-login class="rs-primary">로그인</button>')) +
      card(
        "빠른 배달 문구",
        phrases
          .map(
            (x) =>
              '<button class="rs-copy" data-rs-copy="' +
              H(x) +
              '">' +
              H(x) +
              " <span>복사</span></button>",
          )
          .join(""),
      ) +
      card(
        "바로 가기",
        '<div class="rs-linkgrid"><a href="https://map.naver.com/" target="_blank" rel="noopener noreferrer">네이버 지도 ↗</a><a href="https://map.kakao.com/" target="_blank" rel="noopener noreferrer">카카오맵 ↗</a></div><p class="rs-small">앱 자동 전환이나 주문 정보 수집은 지원하지 않아요.</p>',
      )
    );
  }

  function summarizeWork(rows) {
    const sum = (key) => rows.reduce((total, row) => total + N(row[key]), 0);
    return {
      gross: sum("gross"),
      cost: sum("other_costs") + sum("fuel_costs") + sum("maintenance_costs"),
      unclassified: sum("unclassified_costs"),
      entries: sum("entries"),
    };
  }
  function workOverview() {
    if (!S.user)
      return '<div class="rs33-work-overview"><p>내 수익·주유·정비 기록을 계정에서 확인해요.</p><button type="button" class="rs-primary" data-rs-login>로그인</button></div>';
    const all = S.data.workStats?.last_7_days;
    if (!Array.isArray(all))
      return (
        '<div class="rs33-work-overview" role="status"><p>' +
        (S.dataLoaded
          ? "수익 요약을 불러오지 못했어요."
          : "수익과 비용을 조회하는 중…") +
        "</p>" +
        (S.dataLoaded
          ? '<button type="button" data-rs-refresh-work>다시 조회</button>'
          : "") +
        "</div>"
      );
    const today = S.period !== "week",
      rows = today ? all.filter((row) => row.day === nowDate()) : all;
    const total = summarizeWork(rows);
    const allowed = new Set(rows.map((row) => row.day));
    const platforms = new Map([
      ["쿠팡이츠", 0],
      ["배민", 0],
    ]);
    for (const row of S.data.earnings) {
      if (!allowed.has(row.work_date)) continue;
      const platform = row.platform === "배민커넥트" ? "배민" : row.platform;
      platforms.set(
        platform,
        (platforms.get(platform) || 0) + N(row.gross_won),
      );
    }
    const complete =
      [...platforms.values()].reduce((n, v) => n + v, 0) === total.gross;
    return (
      '<section class="rs33-work-overview" aria-label="기간별 수익 요약"><div class="rs33-work-summary-head"><h2>수익 요약</h2><div class="rs33-work-period">' +
      ["today", "week"]
        .map(
          (value) =>
            '<button type="button" data-rs-work-period="' +
            value +
            '" aria-pressed="' +
            (today ? value === "today" : value === "week") +
            '">' +
            (value === "today" ? "오늘" : "최근 7일") +
            "</button>",
        )
        .join("") +
      "</div></div>" +
      '<div class="rs33-work-amount"><small>기록한 수입</small><strong>' +
      M(total.gross) +
      "</strong>" +
      "<div><span>기록한 비용<strong>" +
      M(total.cost) +
      "</strong></span><span>비용 반영 추정액<strong>" +
      (total.unclassified ? "확인 필요" : M(total.gross - total.cost)) +
      "</strong></span></div></div>" +
      (total.unclassified
        ? '<p class="rs33-muted">기존 비용이 주유·정비비와 겹치는지 확인이 필요해요.</p>'
        : "") +
      (complete
        ? '<div class="rs33-work-platforms">' +
          [...platforms.entries()]
            .map(
              ([platform, value]) =>
                '<button type="button" data-rs-work-platform="' +
                H(platform) +
                '"><span>' +
                H(platform === "배민" ? "배민커넥트" : platform) +
                "</span><strong>" +
                M(value) +
                " ›</strong></button>",
            )
            .join("") +
          "</div>"
        : "") +
      '<button type="button" class="rs-primary" data-rs-income-new>＋ 수익 기록</button></section>'
    );
  }
  function renderHub() {
    const tracking = window.__rsRideApi?.trip;
    return (
      '<div class="rs-work-hub rs33-work"><div class="rs33-work-title"><h1>업무</h1><span class="rs33-state">라이더 도구</span></div>' +
      '<div class="rs33-work-running"><div><small>운행 기록</small><strong>' +
      (tracking
        ? window.__rsRideApi?.paused
          ? "휴식 중"
          : "기록 중"
        : "시작 전") +
      "</strong></div>" +
      '<button type="button" class="rs-primary" ' +
      (tracking ? "data-rs-go-trips" : "data-rs-start-ride") +
      ">" +
      (tracking ? "운행 보기 · 종료" : "운행 시작") +
      "</button></div>" +
      workOverview() +
      '<h2 class="rs-work-group-title">수익·차량 관리</h2><div class="rs33-work-quick" aria-label="업무 기록">' +
      [
        ["earnings", "수익"],
        ["fuel", "주유"],
        ["maintenance", "정비"],
      ]
        .map(
          ([id, label]) =>
            '<button type="button" data-rs-tab="' +
            id +
            '">' +
            iconMarkup(id) +
            "<span>" +
            label +
            "</span></button>",
        )
        .join("") +
      "</div>" +
      '<h2 class="rs-work-group-title">현장 편의 도구</h2><div class="rs33-work-quick rs33-work-utilities" aria-label="추가 업무 메뉴">' +
      [
        ["analysis", "월별 수익 분석"],
        ["places", "편의시설"],
        ["roads", "도로 제보"],
        ["sos", "라이더 도움"],
        ["shortcuts", "빠른 도구"],
      ]
        .map(
          ([id, label]) =>
            '<button type="button" data-rs-tab="' +
            id +
            '">' +
            iconMarkup(id) +
            "<span>" +
            label +
            "</span></button>",
        )
        .join("") +
      "</div></div>"
    );
  }
  function fuelRate(records) {
    const ordered = records
      .slice()
      .sort(
        (a, b) =>
          String(a.fueled_on).localeCompare(String(b.fueled_on)) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      );
    let start = null,
      liters = 0,
      valid = true,
      recent = null;
    for (const row of ordered) {
      const item = Number(row.liters),
        odo = row.odometer_km;
      if (start !== null) {
        if (!Number.isFinite(item) || item <= 0) valid = false;
        else liters += item;
        if (odo != null && Number(odo) < start) valid = false;
      }
      if (row.full_tank && odo != null) {
        if (start !== null && valid && liters > 0 && Number(odo) > start)
          recent = { distance: Number(odo) - start, liters };
        start = Number(odo);
        liters = 0;
        valid = true;
      }
    }
    return recent;
  }

  function render() {
    if (!root || !S.active) return;
    const t = TABS.find((x) => x[0] === S.tab) || TABS[0];
    const intro = {
      places: "함께 만들어가는 라이더 시설 지도",
      earnings: "배달 수익·비용을 기록하고 확인해요",
      maintenance: "내 오토바이 정비 이력 보관",
      fuel: "주유비를 한 번 입력하고 자동으로 정산해요",
      analysis: "전체 기록을 서버에서 정확하게 집계해요",
      roads: "유효 시간이 있는 현장 위험 정보",
      sos: "도움 요청과 라이더 간 답글",
      shortcuts: "배달 중 자주 쓰는 기능 모음",
    };
    const content = S.user || S.tab === "shortcuts" || S.tab === "places"
      ? (
          {
            places: renderPlaces,
            earnings: renderEarnings,
            fuel: renderFuel,
            maintenance: renderMaintenance,
            analysis: renderAnalysis,
            roads: renderRoads,
            sos: renderSos,
            shortcuts: renderShortcuts,
          }[S.tab] || renderPlaces
        )()
      : card(
          "로그인이 필요해요",
          '<p class="rs-small">수익 기록·도로 제보·SOS를 안전하게 저장하려면 먼저 계정으로 로그인해 주세요.</p><button class="rs-primary" data-rs-login>로그인 화면으로 이동</button>',
        );
    root.innerHTML =
      (S.tab === "hub"
        ? renderHub()
        : tabHeader(t[1], intro[S.tab]) +
          '<div class="rs-body">' +
          content +
          "</div>") +
      '<div id="rs-message" class="rs-toast" hidden role="status"></div>';
    if (S.lastError) msg(S.lastError);
  }
  function open(tab, id) {
    S.tab = tab || "hub";
    window.scrollTo(0, 0);
    S.selectedSOS = id || null;
    S.lastError = "";
    if (window.__rsGoToTab) window.__rsGoToTab("tools");
    ensureUI();
    if (S.active) render();
    if (S.tab === "sos" && id) refreshReplies(id);
    if (S.user && !S.dataLoaded) loadAll();
    setTimeout(() => {
      ensureUI();
      if (S.active && !document.activeElement?.closest("#rs-tools form"))
        render();
    }, 120);
    setTimeout(() => {
      ensureUI();
      if (S.active && !document.activeElement?.closest("#rs-tools form"))
        render();
    }, 550);
  }
  window.__rsOpenTool = open;
  function close() {
    S.active = false;
    root.hidden = true;
    S.lastError = "";
    if (window.__rsGoToTab) window.__rsGoToTab("nearby");
  }

  function ensureUI() {
    if (!root) {
      root = document.createElement("section");
      root.id = "rs-tools";
      root.hidden = true;
      root.setAttribute("aria-label", "라이더 업무 도구");
      document.body.append(root);
    }
    const host = document.getElementById("rs-tools-host");
    if (host) {
      if (root.parentNode !== host) host.appendChild(root);
      if (!S.active) {
        S.active = true;
        root.hidden = false;
        render();
        if (S.user && !S.dataLoaded) loadAll();
      }
    } else {
      S.active = false;
      if (!root.hidden) root.hidden = true;
      if (root.parentNode !== document.body) document.body.append(root);
    }
    const map = document.querySelector(".map-wrap");
    if (map && !map.querySelector("#rs-sos-fab")) {
      const b = document.createElement("button");
      b.type = "button";
      b.id = "rs-sos-fab";
      b.innerHTML =
        '<span class="rs-sos-button-mark" aria-hidden="true">SOS</span><span class="rs-sos-button-title">도움 요청</span>';
      b.setAttribute("aria-label", "라이더에게 SOS 도움 요청하기");
      b.onclick = () => open("sos");
      map.append(b);
    }
  }
  function isVisibleMap() {
    return !!window.__rsMap && !!window.__rsLeaflet && !!$(".map-wrap");
  }
  function mapOverlay() {
    try {
      if (!isVisibleMap()) return;
      const map = window.__rsMap,
        L = window.__rsLeaflet;
      if (S.overlayMap !== map) {
        S.overlayMap = map;
        S.overlay = L.layerGroup().addTo(map);
      }
      const layer = S.overlay;
      layer.clearLayers();
      if (!S.user) return;
      const riders = Array.isArray(window.__rsMapRiders)
        ? window.__rsMapRiders
        : [];
      const myPos = window.__rsMapPosition;
      for (const x of S.data.sos.filter(activeSOS)) {
        let position = null;
        if (x.user_id === S.user.id && window.__rsRideApi?.sharing && myPos)
          position = myPos;
        else if (window.__rsRideApi?.sharing)
          position = riders.find((r) => r.user_id === x.user_id);
        if (
          !position ||
          !Number.isFinite(Number(position.lat)) ||
          !Number.isFinite(Number(position.lng))
        )
          continue;
        const icon = L.divIcon({
          className: "rs-sos-div-icon",
          html: '<span class="rs-sos-marker">SOS</span>',
          iconSize: [45, 45],
          iconAnchor: [22, 22],
        });
        const marker = L.marker([position.lat, position.lng], {
          icon,
          zIndexOffset: 1000,
        }).addTo(layer);
        const popup = document.createElement("div");
        popup.className = "rs-map-popup";
        const title = document.createElement("strong");
        title.textContent = "🆘 " + x.category + " · " + x.nickname;
        const body = document.createElement("p");
        body.textContent = x.message;
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "SOS 게시판에서 보기";
        button.onclick = () => open("sos", x.id);
        popup.append(title, body, button);
        marker.bindPopup(popup);
      }
    } catch (e) {
      console.warn("RiderSpot map markers", e);
    }
  }
  async function loadAll() {
    if (!S.user || !S.client) return;
    const q = S.client,
      owner = S.user.id,
      request = (S.loadRequest || 0) + 1;
    S.loadRequest = request;
    const queries = [
      [
        "workStats",
        () =>
          q.rpc("rider_work_stats", { p_month: nowDate().slice(0, 7) + "-01" }),
      ],
      [
        "places",
        () =>
          q
            .from("rider_places")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(120),
      ],
      [
        "earnings",
        () =>
          q
            .from("rider_earnings")
            .select("*")
            .order("work_date", { ascending: false })
            .limit(300),
      ],
      [
        "fuel",
        () =>
          q
            .from("rider_fuel_logs")
            .select("*")
            .eq("user_id", S.user.id)
            .order("fueled_on", { ascending: false })
            .limit(200),
      ],
      [
        "maintenance",
        () =>
          q
            .from("maintenance_logs")
            .select("*")
            .order("serviced_on", { ascending: false })
            .limit(150),
      ],
      [
        "trips",
        () =>
          q
            .from("trips")
            .select("id,started_at,ended_at,distance_km")
            .order("started_at", { ascending: false })
            .limit(100),
      ],
      [
        "roads",
        () =>
          q
            .from("road_reports")
            .select("*")
            .gt("expires_at", new Date().toISOString())
            .order("created_at", { ascending: false })
            .limit(100),
      ],
      [
        "sos",
        () =>
          q
            .from("sos_requests")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(120),
      ],
      [
        "settings",
        () =>
          q
            .from("rider_settings")
            .select("*")
            .eq("user_id", S.user.id)
            .maybeSingle(),
      ],
    ];
    const result = await Promise.allSettled(
      queries.map(async ([name, fn]) => ({ name, value: await db(fn()) })),
    );
    if (S.user?.id !== owner || S.loadRequest !== request) return;
    const errors = [];
    result.forEach((r, i) => {
      if (r.status === "fulfilled") S.data[r.value.name] = r.value.value;
      else errors.push(queries[i][0] + ": " + r.reason.message);
    });
    S.dataLoaded = true;
    mapOverlay();
    if (S.active && !document.activeElement?.closest("form")) render();
    if (errors.length)
      msg("일부 데이터 조회 실패: " + errors.join(" · "), true);
  }
  async function refreshSos() {
    if (!S.user || !S.client) return;
    try {
      S.data.sos = await db(
        S.client
          .from("sos_requests")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(120),
      );
      mapOverlay();
      if (
        S.active &&
        S.tab === "sos" &&
        !document.activeElement?.closest("form")
      )
        render();
    } catch (e) {
      console.warn("SOS refresh failed", e);
    }
  }
  async function refreshReplies(id) {
    if (!S.user || !id) return;
    try {
      S.data.replies = await db(
        S.client
          .from("sos_replies")
          .select("*")
          .eq("sos_id", id)
          .order("created_at", { ascending: true })
          .limit(100),
      );
      if (S.active && S.tab === "sos") render();
    } catch (e) {
      msg(e.message, true);
    }
  }
  function gps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(Error("위치 기능을 지원하지 않는 기기예요."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (x) => resolve({ lat: x.coords.latitude, lng: x.coords.longitude }),
        () => reject(Error("GPS 권한을 허용하고 다시 시도해 주세요.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }
  async function submitForm(form) {
    if (S.busy || !requireUser()) return;
    const type = form.dataset.rsForm,
      fd = new FormData(form),
      v = (k) => String(fd.get(k) || "").trim();
    const client = S.client,
      user = S.user;
    const submit = form.querySelector('[type="submit"],button.rs-primary');
    S.busy = true;
    if (submit) submit.disabled = true;
    try {
      if (type === "places" || type === "roads") {
        const lat = Number(v("lat")),
          lng = Number(v("lng"));
        if (
          !v("lat") ||
          !v("lng") ||
          !Number.isFinite(lat) ||
          !Number.isFinite(lng)
        )
          throw Error("현재 위치 가져오기를 먼저 눌러 주세요.");
        const fields = {
          user_id: user.id,
          nickname: nick(),
          category: v("category"),
          title: v("title"),
          details: v("details"),
          lat,
          lng,
        };
        if (type === "roads")
          fields.expires_at = new Date(
            Date.now() + N(v("hours")) * 3600000,
          ).toISOString();
        await db(
          client
            .from(type === "places" ? "rider_places" : "road_reports")
            .insert(fields),
        );
        window.dispatchEvent(
          new CustomEvent("riderspot:report-saved", { detail: { type } }),
        );
      } else if (type === "earnings") {
        await db(
          client
            .from("rider_earnings")
            .insert({
              user_id: user.id,
              work_date: v("work_date"),
              platform: v("platform"),
              deliveries: N(v("deliveries")),
              gross_won: N(v("gross_won")),
              expenses_won: N(v("expenses_won")),
              expense_scope: "other_only",
              hours: N(v("hours")),
              distance_km: N(v("distance_km")),
              note: v("note"),
            }),
        );
      } else if (type === "fuel") {
        const cost = Number(v("cost_won")),
          liters = v("liters") === "" ? null : Number(v("liters")),
          km = v("odometer_km") === "" ? null : Number(v("odometer_km"));
        if (!Number.isInteger(cost) || cost < 1 || cost > 1000000000)
          throw Error("주유 금액을 정확하게 입력해 주세요.");
        if (
          liters !== null &&
          (!Number.isFinite(liters) || liters <= 0 || liters > 150)
        )
          throw Error("주유량을 확인해 주세요.");
        if (km !== null && (!Number.isInteger(km) || km < 0 || km > 9999999))
          throw Error("계기판 거리를 확인해 주세요.");
        await db(
          client
            .from("rider_fuel_logs")
            .insert({
              user_id: user.id,
              fueled_on: v("fueled_on") || nowDate(),
              cost_won: cost,
              liters,
              odometer_km: km,
              full_tank: fd.get("full_tank") === "on",
              note: v("note"),
            }),
        );
      } else if (type === "maintenance") {
        await db(
          client
            .from("maintenance_logs")
            .insert({
              user_id: user.id,
              item: v("item"),
              serviced_on: v("serviced_on"),
              odometer_km: v("odometer_km") ? N(v("odometer_km")) : null,
              cost_won: N(v("cost_won")),
              next_due_km: v("next_due_km") ? N(v("next_due_km")) : null,
              note: v("note"),
            }),
        );
      } else if (type === "sos") {
        const message = v("message");
        const chars = Array.from(message).length;
        if (chars < 5 || chars > 600)
          throw Error(
            "도움 요청 내용을 5자 이상 600자 이하로 구체적으로 입력해 주세요.",
          );
        if (S.data.sos.some((x) => x.user_id === user.id && activeSOS(x)))
          throw Error("진행 중인 SOS를 먼저 종료해 주세요.");
        if (fd.get("show_on_map") === "on" && !window.__rsRideApi?.sharing) {
          if (
            confirm(
              "주변 라이더가 내 위치를 볼 수 있도록 위치 공유를 켤까요? SOS는 긴급 구조 서비스를 대체하지 않아요.",
            )
          ) {
            try {
              if (!window.__rsRideApi?.startSharing)
                throw Error("지도 화면에서 먼저 위치 공유를 시작해 주세요.");
              await window.__rsRideApi.startSharing();
            } catch (e) {
              msg("위치 공유를 켜지 못했어요. SOS 글만 등록할게요.", true);
            }
          } else {
            msg("위치 공유 없이 SOS 게시판에만 요청을 등록할게요.");
          }
        }
        await db(
          client
            .from("sos_requests")
            .insert({
              user_id: user.id,
              nickname: nick(),
              category: v("category"),
              message: v("message"),
              area_label: v("area_label"),
            }),
        );
      } else if (type === "reply") {
        await db(
          client
            .from("sos_replies")
            .insert({
              sos_id: v("sos_id"),
              user_id: user.id,
              nickname: nick(),
              message: v("message"),
            }),
        );
      } else if (type === "settings") {
        await db(
          client
            .from("rider_settings")
            .upsert({
              user_id: user.id,
              emergency_phone: v("emergency_phone"),
              updated_at: new Date().toISOString(),
            }),
        );
      }
      S.lastError = "";
      await loadAll();
      if (type === "reply") await refreshReplies(v("sos_id"));
      if (S.active && type !== "reply") render();
      msg("기록을 저장했어요.");
    } catch (e) {
      const raw = String(e?.message || "잠시 후 다시 시도해 주세요.");
      const friendly = raw.includes("sos_requests_message_check")
        ? "도움 요청 내용은 최소 5자 이상 입력해야 해요."
        : raw.includes("sos_one_active_per_user_idx")
          ? "이미 진행 중인 SOS가 있어요. 기존 요청을 종료해 주세요."
          : raw;
      msg("저장 실패: " + friendly, true);
    } finally {
      S.busy = false;
      if (submit) submit.disabled = false;
    }
  }
  async function delItem(table, id) {
    if (!requireUser()) return;
    const ok = {
      rider_earnings: "수익",
      rider_fuel_logs: "주유",
      maintenance_logs: "정비",
      rider_places: "편의시설",
      road_reports: "도로 제보",
    }[table];
    if (!ok || !confirm(ok + " 기록을 삭제할까요?")) return;
    try {
      await db(
        S.client.from(table).delete().eq("id", id).eq("user_id", S.user.id),
      );
      await loadAll();
      if (table === "rider_places" || table === "road_reports")
        window.dispatchEvent(
          new CustomEvent("riderspot:report-saved", {
            detail: { type: table === "rider_places" ? "places" : "roads" },
          }),
        );
      msg("삭제했어요.");
    } catch (e) {
      msg(e.message, true);
    }
  }
  async function resolveSOS(id) {
    if (!confirm("이 SOS 도움 요청을 종료할까요?")) return;
    try {
      await db(
        S.client
          .from("sos_requests")
          .update({ status: "resolved", resolved_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", S.user.id),
      );
      S.selectedSOS = null;
      await loadAll();
      msg("SOS 요청을 종료했어요.");
    } catch (e) {
      msg(e.message, true);
    }
  }
  async function prepareSMS() {
    if (!requireUser()) return;
    const phone = String(S.data.settings?.emergency_phone || "").replace(
      /[^\d+]/g,
      "",
    );
    if (!phone) {
      msg("먼저 도구함의 긴급 연락처를 저장해 주세요.", true);
      return;
    }
    try {
      const pos = await gps();
      const text =
        "라이더스팟: 도움이 필요합니다. 제 현재 위치는 https://www.google.com/maps?q=" +
        pos.lat.toFixed(6) +
        "," +
        pos.lng.toFixed(6) +
        " 입니다. 이 문자는 전송 전 확인해 주세요.";
      window.location.href =
        "sms:" + phone + "?body=" + encodeURIComponent(text);
    } catch (e) {
      msg(e.message, true);
    }
  }
  async function copy(v) {
    try {
      await navigator.clipboard.writeText(v);
      msg("문구를 복사했어요.");
    } catch (e) {
      msg("복사 권한이 필요해요. 브라우저에서 허용해 주세요.", true);
    }
  }
  function bindEvents() {
    root.addEventListener("click", async (e) => {
      const x = e.target.closest("button");
      if (!x) return;
      if (x.hasAttribute("data-rs-close")) return close();
      if (x.hasAttribute("data-rs-hub")) return open("hub");
      if (x.hasAttribute("data-rs-go-trips")) {
        S.active = false;
        root.hidden = true;
        window.__rsGoToTab?.("trips");
        return;
      }
      if (x.hasAttribute("data-rs-work-map")) {
        S.active = false;
        root.hidden = true;
        window.__rsGoToTab?.("nearby");
        return;
      }
      if (x.hasAttribute("data-rs-start-ride")) {
        window.__rsGoToTab?.("trips");
        return window.__rsRideApi?.startTrip();
      }
      if (x.hasAttribute("data-rs-refresh-work")) return loadAll();
      if (x.dataset.rsWorkPeriod) {
        S.period = x.dataset.rsWorkPeriod;
        render();
        root.querySelector('[data-rs-work-period="' + S.period + '"]')?.focus();
        return;
      }
      if (x.hasAttribute("data-rs-income-new")) {
        S.platform = "";
        return open("earnings");
      }
      if (x.dataset.rsWorkPlatform) {
        S.platform = x.dataset.rsWorkPlatform;
        return open("earnings");
      }
      if (x.hasAttribute("data-rs-clear-platform")) {
        S.platform = "";
        return render();
      }
      if (x.dataset.rsPaid) {
        const row = S.data.earnings.find(
          (entry) => entry.id === x.dataset.rsPaid,
        );
        if (!row || !S.user || S.busy) return;
        S.busy = true;
        x.disabled = true;
        try {
          await db(
            S.client
              .from("rider_earnings")
              .update({ paid_at: row.paid_at ? null : nowDate() })
              .eq("id", row.id)
              .eq("user_id", S.user.id),
          );
          await loadAll();
          if (S.active) render();
          msg(
            row.paid_at
              ? "입금 표시를 해제했어요."
              : "입금을 확인으로 표시했어요.",
          );
        } catch (error) {
          msg(error.message || "입금 상태를 바꾸지 못했어요.", true);
        } finally {
          S.busy = false;
          x.disabled = false;
        }
        return;
      }
      if (x.dataset.rsLinkedRoad) {
        const report = S.data.roads.find(
          (row) =>
            row.id === x.dataset.rsLinkedRoad &&
            Date.parse(row.expires_at) > Date.now(),
        );
        if (report)
          window.__rs33OpenCommunity?.({
            link: { kind: "roads", id: report.id, title: report.title },
          });
        return;
      }
      if (x.dataset.rsTab) {
        S.platform = "";
        return open(x.dataset.rsTab);
      }
      if (x.dataset.rsLogin) {
        close();
        $(".header-user")?.click();
        return;
      }
      if (x.dataset.rsDel) return delItem(x.dataset.rsDel, x.dataset.rsId);
      if (x.dataset.rsResolve) return resolveSOS(x.dataset.rsResolve);
      if (x.dataset.rsOpenSos) return open("sos", x.dataset.rsOpenSos);
      if (x.hasAttribute("data-rs-back-sos")) return open("sos");
      if (x.dataset.rsCopy) return copy(x.dataset.rsCopy);
      if (x.hasAttribute("data-rsSms")) return prepareSMS();
      if (x.hasAttribute("data-rsGps")) {
        const form = x.closest("form"),
          status = $(".rs-gps-status", form);
        x.disabled = true;
        try {
          const p = await gps();
          form.elements.lat.value = p.lat;
          form.elements.lng.value = p.lng;
          status.textContent =
            "위치 선택 완료 · " + p.lat.toFixed(4) + ", " + p.lng.toFixed(4);
        } catch (err) {
          status.textContent = err.message;
        } finally {
          x.disabled = false;
        }
        return;
      }
      if (x.dataset.rsPan) {
        const coords = x.dataset.rsPan.split(",").map(Number);
        if (coords.length === 2 && coords.every(Number.isFinite)) {
          window.__rsPendingMapCenter = coords;
          S.active = false;
          root.hidden = true;
          window.__rsGoToTab?.("nearby");
        }
        return;
      }
    });
    root.addEventListener("input", (e) => {
      const el = e.target;
      if (el?.matches('form[data-rs-form="sos"] textarea[name="message"]')) {
        const count = Array.from(el.value.trim()).length;
        const label = el.closest("label")?.querySelector("[data-rs-count]");
        if (label) {
          label.textContent = count + " / 600자 · 최소 5자";
          label.classList.toggle("rs-length-short", count < 5);
        }
      }
    });
    root.addEventListener("submit", (e) => {
      const form = e.target.closest("form[data-rs-form]");
      if (!form) return;
      e.preventDefault();
      submitForm(form);
    });
  }
  async function start() {
    if (!document.body) return;
    ensureUI();
    bindEvents();
    const tryClient = () => {
      if (!window.__rsClient) return false;
      S.client = window.__rsClient;
      return true;
    };
    let checks = 0;
    const interval = setInterval(async () => {
      if (tryClient()) {
        clearInterval(interval);
        try {
          const res = await S.client.auth.getUser();
          S.user = res.data?.user || null;
        } catch {}
        S.client.auth.onAuthStateChange((event, session) => {
          const previous = S.user?.id;
          S.user = session?.user || null;
          if (previous !== S.user?.id) {
            S.dataLoaded = false;
            S.platform = "";
            S.lastError = "";
            S.data = {
              places: [],
              earnings: [],
              fuel: [],
              maintenance: [],
              trips: [],
              roads: [],
              sos: [],
              replies: [],
              settings: null,
            };
          }
          if (S.user && previous !== S.user.id) loadAll();
          if (S.active) render();
          mapOverlay();
        });
        if (S.user) loadAll();
      } else if (++checks > 40) {
        clearInterval(interval);
        console.warn("Rider Spot tools: authentication client unavailable");
      }
    }, 300);
    new MutationObserver(ensureUI).observe(document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("riderspot:map", mapOverlay);
    window.addEventListener("riderspot:nickname", () => {
      if (S.user) {
        loadAll();
        if (S.active) render();
      }
    });
    setInterval(() => {
      if (S.user) refreshSos();
    }, 20000);
    setInterval(() => {
      if (S.user) loadAll();
    }, 120000);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
