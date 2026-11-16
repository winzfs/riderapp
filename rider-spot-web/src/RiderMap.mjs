import { addBasemap } from "./basemap.mjs";
import { createMapController } from "./map-controller.mjs";
import { rs33DrawCourse, paintCourseLabels } from "./course-layers.mjs";

const EMPTY = [];
const presence = {
  chat: ["💬", "대화 환영", "이 라이더는 대화를 환영하고 있어요."],
  working: ["🛵", "배달 중", "지금 배달 중이라는 표시예요."],
  break: ["☕", "잠시 쉬는 중", "지금 잠시 쉬고 있다는 표시예요."],
  help: ["🤝", "도움 가능", "도움을 줄 여유가 있다는 표시예요."],
};
const validPosition = (value) =>
  value &&
  Number.isFinite(Number(value.lat)) &&
  Number.isFinite(Number(value.lng));

function paintRiders(L, layer, riders) {
  layer.clearLayers();
  for (const rider of riders) {
    if (!validPosition(rider)) continue;
    const coordinates = [rider.lat, rider.lng];
    const status = rider.presence_status;
    const badge = Object.hasOwn(presence, status) ? presence[status] : null;
    L.circle(coordinates, {
      radius: 90,
      color: "#339f73",
      weight: 1,
      fillColor: "#50c29b",
      fillOpacity: 0.1,
    }).addTo(layer);
    const html = `<span class="rs-peer-scooter">🛵</span>${badge ? `<span class="rs-peer-presence-badge rs-peer-${status}">${badge[0]}</span>` : ""}`;
    const icon = L.divIcon({
      className: "rs-peer-location",
      html,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    const popup = document.createElement("div");
    popup.className = "rs-peer-status-popup";
    const title = document.createElement("strong");
    title.textContent = rider.nickname;
    const text = document.createElement("span");
    text.textContent = badge ? `${badge[0]} ${badge[1]}` : "상태 표시 안 함";
    const explanation = document.createElement("small");
    explanation.textContent = badge?.[2] || "현재 공개된 상태가 없어요.";
    popup.append(title, text, explanation);
    L.marker(coordinates, { icon })
      .addTo(layer)
      .bindPopup(popup, { offset: [0, -12] });
  }
}

export function createRiderMap(React, L, fallback) {
  return function RiderMap({ position, riders = EMPTY, focus = 0, course }) {
    const node = React.useRef(null);
    const controller = React.useRef(null);
    const marker = React.useRef(null);
    const accuracy = React.useRef(null);
    const peers = React.useRef(null);
    const originalFocus = React.useRef(focus);
    const initialFit = React.useRef(course?.fitRequest);
    const cameraId = course?.id || "main";

    React.useLayoutEffect(() => {
      const current = createMapController(L, node.current, cameraId, fallback);
      const map = current.map;
      controller.current = current;
      window.__rsLeaflet = L;
      window.__rsMap = map;
      const removeBasemap = addBasemap(L, map);
      L.control.zoom({ position: "topright" }).addTo(map);
      peers.current = L.layerGroup().addTo(map);
      return () => {
        controller.current = null;
        peers.current = marker.current = accuracy.current = null;
        if (window.__rsMap === map) window.__rsMap = null;
        removeBasemap();
        current.destroy();
      };
    }, [cameraId]);

    React.useEffect(() => {
      if (cameraId !== "main") return;
      paintRiders(L, peers.current, riders);
      window.__rsMapRiders = riders;
      window.dispatchEvent(new Event("riderspot:map"));
    }, [cameraId, riders]);

    React.useEffect(() => {
      const current = controller.current;
      if (cameraId === "main") {
        window.__rsMapPosition = position;
      }
      if (!validPosition(position)) return;
      const map = current.map;
      const coordinates = [Number(position.lat), Number(position.lng)];
      if (cameraId === "main") {
        if (focus !== originalFocus.current) {
          originalFocus.current = focus;
          current.moveTo(position, 16);
        } else current.initialLocation(position);
      }
      if (!marker.current) {
        const icon = L.divIcon({
          className: "rs-self-location",
          html: '<span class="rs-self-halo"></span><span class="rs-self-arrow"></span><span class="rs-self-dot"></span>',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });
        marker.current = L.marker(coordinates, { icon, zIndexOffset: 6500 })
          .addTo(map)
          .bindTooltip("내 위치 · 나에게만 표시", {
            direction: "top",
            offset: [0, -19],
          });
      } else marker.current.setLatLng(coordinates);
      const radius = Number(position.accuracy);
      if (radius > 0 && radius <= 200) {
        if (!accuracy.current)
          accuracy.current = L.circle(coordinates, {
            radius,
            weight: 1,
            color: "#5e9afa",
            fillColor: "#6d9eff",
            fillOpacity: 0.08,
            opacity: 0.45,
            interactive: false,
            className: "rs-gps-accuracy",
          }).addTo(map);
        else accuracy.current.setLatLng(coordinates).setRadius(radius);
      } else if (accuracy.current) {
        accuracy.current.remove();
        accuracy.current = null;
      }
    }, [cameraId, position, focus]);

    React.useEffect(() => {
      if (!course?.bounds) return;
      const explicit = initialFit.current !== course.fitRequest;
      initialFit.current = course.fitRequest;
      controller.current.showBounds(course.bounds, explicit);
    }, [cameraId, course?.bounds, course?.fitRequest]);

    React.useEffect(() => {
      if (!course?.geometry) return;
      const map = controller.current.map;
      return rs33DrawCourse(L, map, course.geometry);
    }, [cameraId, course?.geometry]);

    React.useEffect(() => {
      if (!course?.geometry) return;
      return paintCourseLabels(
        L,
        controller.current.map,
        course.geometry,
        course.stamps,
        course.onStamp,
      );
    }, [cameraId, course?.geometry, course?.stamps, course?.onStamp]);

    return React.createElement("div", {
      className: "map",
      ref: node,
      "aria-label": course ? "운행 경로 지도" : "주변 지도",
    });
  };
}
