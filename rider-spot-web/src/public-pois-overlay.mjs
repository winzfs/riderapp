// Optional OSM public-facility overlay. Public POIs stay independent from
// rider_places, road reports, live location sharing and GPS/SQLite timelines.
// The overlay uses bounded, read-only Supabase queries and never remounts a map.
import { isVisibleFacility, VISIBLE_FACILITY } from "./facility-visibility.mjs";

export function createPublicPoiOverlay(openMapSheet) {
  const state = { map: null, group: null, seq: 0, credit: null };
  const toiletIcon = { type: "toilet", glyph: "WC" };
  const valid = (place) => place &&
    Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)) &&
    Math.abs(Number(place.lat)) <= 90 && Math.abs(Number(place.lng)) <= 180;
  const allowed = isVisibleFacility;
  const nearRiderReport = (poi, reported) =>
    reported.some((r) => r.category === poi.category && valid(r) &&
      Math.abs(Number(r.lat) - Number(poi.lat)) < 0.00023 &&
      Math.abs(Number(r.lng) - Number(poi.lng)) < 0.00028);

  function clear() {
    state.seq++;
    state.group?.clearLayers();
    if (state.credit) state.credit.hidden = true;
  }
  function attach(map, L) {
    if (state.map === map && state.group) return;
    if (state.map && state.group) {
      try { state.group.remove(); } catch {}
    }
    state.seq++;
    state.map = map;
    state.group = L.layerGroup().addTo(map);
    state.credit = null;
  }
  function creditNode(map) {
    const wrap = map.getContainer()?.closest(".map-wrap");
    if (!wrap) return null;
    let el = wrap.querySelector(".rs-public-poi-credit");
    if (!el) {
      el = document.createElement("div");
      el.className = "rs-public-poi-credit";
      el.setAttribute("role", "status");
      const label = document.createElement("span");
      label.className = "rs-public-poi-count";
      const a = document.createElement("a");
      a.textContent = "© OpenStreetMap · ODbL";
      a.href = "https://www.openstreetmap.org/copyright";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      el.append(label, a);
      wrap.append(el);
    }
    state.credit = el;
    return el;
  }
  function popup(map, marker, poi) {
    const body = document.createElement("div");
    body.className = "rs-report-popup rs33-report-popup rs-public-poi-popup";
    const tag = document.createElement("span");
    tag.className = "rs-report-badge";
    tag.textContent = "공공 지도 정보 · " + poi.category;
    const title = document.createElement("strong");
    title.textContent = poi.title;
    body.append(tag, title);
    if (poi.details) {
      const details = document.createElement("p");
      details.textContent = poi.details;
      body.append(details);
    }
    const notice = document.createElement("small");
    notice.textContent = "OpenStreetMap 등록 정보예요. 실제 개방·운영 여부를 방문 전 확인해 주세요.";
    body.append(notice);
    const actions = document.createElement("div");
    actions.className = "rs33-popup-actions";
    const navigate = document.createElement("a");
    navigate.href = "https://map.kakao.com/link/to/" +
      encodeURIComponent(poi.title) + "," + Number(poi.lat) + "," + Number(poi.lng);
    navigate.rel = "noopener noreferrer";
    navigate.target = "_blank";
    navigate.textContent = "길찾기 ↗";
    actions.append(navigate);
    if (/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(poi.osm_url || "")) {
      const origin = document.createElement("a");
      origin.href = poi.osm_url;
      origin.rel = "noopener noreferrer";
      origin.target = "_blank";
      origin.textContent = "정보 출처 ↗";
      actions.append(origin);
    }
    body.append(actions);
    const attribution = document.createElement("small");
    attribution.textContent = "© OpenStreetMap contributors · ODbL";
    body.append(attribution);
    marker.bindPopup(body, { maxWidth: 300, autoPan: false });
    let closeSheet;
    marker.on("popupopen", () => {
      closeSheet = openMapSheet(body, poi.title);
      map.closePopup();
    });
    marker.on("remove", () => closeSheet?.());
  }
  async function refresh({ map, L, client, riderPlaces = [], filter = "places" }) {
    if (!map || !L) return;
    attach(map, L);
    const zoom = map.getZoom();
    if (!client || !["places", "shelters"].includes(filter) || zoom < 13) {
      clear();
      return;
    }
    const token = ++state.seq;
    const b = map.getBounds();
    const south = Math.max(-90, b.getSouth());
    const north = Math.min(90, b.getNorth());
    const west = b.getWest(), east = b.getEast();
    try {
      let query = client.from("public_pois")
        .select("id,source,source_id,category,title,details,lat,lng,osm_url,imported_at")
        .eq("active", true).eq("category", VISIBLE_FACILITY)
        .gte("lat", south).lte("lat", north)
        .order("source_id", { ascending: true }).limit(150);
      if (west >= -180 && east <= 180 && east >= west && east - west < 360)
        query = query.gte("lng", west).lte("lng", east);
      const { data, error } = await query;
      if (token !== state.seq || map !== state.map) return;
      if (error) throw error;
      // Sparse at city zoom, more information at street level.
      const cap = zoom < 14 ? 20 : zoom < 15 ? 45 : zoom < 16 ? 95 : 190;
      const filtered = (data || []).filter((p) =>
        p.source === "osm" && valid(p) && allowed(filter, p.category) &&
        !nearRiderReport(p, riderPlaces)
      );
      // Toilet-only display: preserve other public records for a future opt-in.
      const visible = filtered.slice(0, cap);
      state.group.clearLayers();
      for (const poi of visible) {
        const kind = toiletIcon;
        const icon = L.divIcon({
          className: "rs-public-marker rs-public-marker--" + kind.type,
          html: '<span class="rs-public-marker-face" aria-hidden="true">' + kind.glyph + "</span>",
          iconSize: [34, 38], iconAnchor: [17, 35],
        });
        const marker = L.marker([+poi.lat, +poi.lng], {
          icon, title: poi.category + " · " + poi.title,
        }).addTo(state.group);
        marker.bindTooltip(poi.category + " · " + poi.title, { direction: "top", offset: [0, -30] });
        popup(map, marker, poi);
      }
      const credit = creditNode(map);
      if (credit) {
        credit.hidden = !filtered.length;
        credit.querySelector(".rs-public-poi-count").textContent =
          "화장실 " + visible.length + "곳";
      }
    } catch (error) {
      if (token !== state.seq) return;
      // The rest of the rider app remains usable if OSM data is unavailable.
      console.warn("공공 시설 표시:", error?.message || error);
    }
  }
  return { refresh, clear };
}
