import { iconMarkup } from './ui.mjs';
import { openMapSheet } from './ui-overlays.mjs';
import { addBasemap } from "./basemap.mjs";
import { createMapController } from "./map-controller.mjs";
import { rs33DrawCourse, paintCourseLabels } from "./course-layers.mjs";
import { createPlaybackLayer, playbackTimestamp } from "./route-playback.mjs";
import { timelineFixStale, timelineHeading } from "./timeline-location.mjs";

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
    const html = `<span class="rs-peer-scooter">${iconMarkup("riders",24)}</span>${badge ? `<span class="rs-peer-presence-badge rs-peer-${status}">${badge[0]}</span>` : ""}`;
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
    let closeSheet;
    const peer = L.marker(coordinates, { icon }).addTo(layer);
    peer.getElement()?.setAttribute("aria-label", rider.nickname + " · " + (badge?.[1] || "라이더"));
    peer.on("click", () => { closeSheet = openMapSheet(popup, rider.nickname); });
    peer.on("remove", () => closeSheet?.());
  }
}

export function createRiderMap(React, L, fallback) {
  return function RiderMap({ position, riders = EMPTY, focus = 0, course }) {
    const node = React.useRef(null);
    const controller = React.useRef(null);
    const marker = React.useRef(null);
    const accuracy = React.useRef(null);
    const startMarker = React.useRef(null);
    const peers = React.useRef(null);
    const player = React.useRef(null);
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
        peers.current = marker.current = accuracy.current = startMarker.current = null;
        player.current = null;
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
      if (course && !course.live) return;
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
        const live = Boolean(course?.live);
        const icon = L.divIcon(live
          ? {
              className: "rs-nav-live-location",
              html: '<span class="rs-nav-bearing"><span class="rs-nav-cone"></span></span><span class="rs-nav-halo"></span><span class="rs-nav-dot"></span>',
              iconSize: [48, 48],
              iconAnchor: [24, 24],
            }
          : {
              className: "rs-self-location",
              html: '<span class="rs-self-halo"></span><span class="rs-self-arrow"></span><span class="rs-self-dot"></span>',
              iconSize: [38, 38],
              iconAnchor: [19, 19],
            });
        marker.current = L.marker(coordinates, {
          icon, zIndexOffset: live ? 7600 : 6500,
          title: live ? "운행 중 현재 위치" : "내 위치",
        })
          .addTo(map)
          .bindTooltip(live ? "현재 위치 · 이 기기에만 표시" : "내 위치 · 나에게만 표시", {
            direction: "top", offset: [0, -23],
          });
      } else marker.current.setLatLng(coordinates);
      if (course?.live) {
        const icon = marker.current.getElement();
        const stale = timelineFixStale(position);
        icon?.classList.toggle("rs-nav-stale", stale);
        const heading = timelineHeading(position);
        icon?.classList.toggle("rs-nav-has-heading", !stale && heading != null);
        if (heading != null) icon?.style.setProperty("--rs-nav-heading", heading + "deg");
      }
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
    }, [cameraId, position, focus, course?.live]);

    // Keep staleness feedback correct when location updates stop without a
    // React re-render (screen lock, GPS outage, browser throttling).
    React.useEffect(() => {
      if (!course?.live) return;
      const refresh = () => {
        const element = marker.current?.getElement();
        element?.classList.toggle("rs-nav-stale", timelineFixStale(position));
        element?.classList.toggle("rs-nav-has-heading",
          !timelineFixStale(position) && timelineHeading(position) != null);
      };
      refresh();
      const timer = window.setInterval(refresh, 10000);
      return () => window.clearInterval(timer);
    }, [cameraId, course?.live, position]);

    React.useEffect(() => {
      const point = course?.startPoint;
      if (!course || !validPosition(point)) return;
      const icon = L.divIcon({
        className: "rs-course-start-pin",
        html: '<span class="rs-start-flag" aria-hidden="true">⚑</span><span class="rs-start-label">시작</span>',
        iconSize: [66, 42],
        iconAnchor: [19, 36],
      });
      const layer = L.marker([Number(point.lat), Number(point.lng)], {
        icon, zIndexOffset: 5000, title: "운행 시작 지점",
        interactive: false, keyboard: false,
      }).addTo(controller.current.map);
      startMarker.current = layer;
      return () => {
        if (startMarker.current === layer) startMarker.current = null;
        layer.remove();
      };
    }, [cameraId, course?.startPoint?.lat, course?.startPoint?.lng]);

    React.useEffect(() => {
      if (!course?.live || !course.follow || !validPosition(position)) return;
      const controllerNow = controller.current;
      if (!controllerNow) return;
      const zoom = Math.max(17, controllerNow.map.getZoom());
      controllerNow.moveTo(position, zoom);
    }, [cameraId, course?.live, course?.follow, position?.lat, position?.lng]);

    React.useEffect(() => {
      if (!course?.live || !course.onUnfollow) return;
      const map = controller.current?.map;
      if (!map) return;
      const onDrag = () => course.onUnfollow();
      map.on("dragstart", onDrag);
      return () => map.off("dragstart", onDrag);
    }, [cameraId, course?.live, course?.onUnfollow]);

    React.useEffect(() => {
      if (!course?.bounds) return;
      const explicit = initialFit.current !== course.fitRequest;
      initialFit.current = course.fitRequest;
      controller.current.showBounds(course.bounds, explicit);
    }, [cameraId, course?.bounds, course?.fitRequest]);

    React.useEffect(() => {
      if (!course?.geometry || course?.playback?.showing) return;
      const map = controller.current.map;
      return rs33DrawCourse(L, map, course.geometry);
    }, [cameraId, course?.geometry, course?.playback?.showing]);

    React.useEffect(() => {
      if (!course?.geometry || course?.playback?.showing) return;
      return paintCourseLabels(
        L,
        controller.current.map,
        course.geometry,
        course.stamps,
        course.onStamp,
      );
    }, [cameraId, course?.geometry, course?.stamps, course?.onStamp, course?.playback?.showing]);

    // The regular label layer is hidden during replay. Keep already-passed
    // stops visible without painting future route labels or full-route arrows.
    const stopPlaybackBucket = course?.playback?.showing
      ? Math.floor((Number(course.playback.elapsed) || 0) / 30000) : -1;
    React.useEffect(() => {
      if (!course?.playback?.showing || !course?.geometry || !course.playback.track) return;
      const at = playbackTimestamp(course.playback.track, course.playback.elapsed);
      const stops = (course.stamps || []).filter((stamp) =>
        at != null && stamp.time <= at);
      if (!stops.length) return;
      return paintCourseLabels(L, controller.current.map, { paths: [] }, stops, course.onStamp);
    }, [cameraId, course?.geometry, course?.stamps, course?.onStamp,
      course?.playback?.showing, course?.playback?.track, stopPlaybackBucket]);

    React.useEffect(() => {
      if (!course?.playback?.showing || !course.playback.track) return;
      const renderer = createPlaybackLayer(
        L, controller.current.map, course.playback.track,
      );
      player.current = renderer;
      renderer.setTime(course.playback.elapsed);
      return () => {
        if (player.current === renderer) player.current = null;
        renderer.destroy();
      };
    }, [cameraId, course?.playback?.showing, course?.playback?.track]);

    React.useEffect(() => {
      if (!course?.playback?.showing) return;
      player.current?.setTime(course.playback.elapsed);
    }, [cameraId, course?.playback?.showing, course?.playback?.elapsed]);

    return React.createElement("div", {
      className: "map",
      ref: node,
      "aria-label": course ? "운행 경로 지도" : "주변 지도",
    });
  };
}
