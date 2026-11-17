const STYLES = { simple: "https://tiles.openfreemap.org/styles/positron" };
const CREDIT =
  '<a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const scripts = [
  "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl.js",
  "https://cdn.jsdelivr.net/npm/@maplibre/maplibre-gl-leaflet@0.1.4/dist/leaflet-maplibre-gl.js",
];
// The rider-facing basemap must not supply a second source of facility pins.
// Toilets come only from the separately filtered public/user POI overlays.
export function hideBasemapPoiLabels(gl) {
  const layers = gl.getStyle?.()?.layers;
  if (!Array.isArray(layers)) return;
  for (const layer of layers) {
    if (layer["source-layer"] !== "poi" && !/^rs-poi-/.test(layer.id)) continue;
    try {
      gl.setLayoutProperty(layer.id, "visibility", "none");
    } catch (error) {
      console.warn("RiderSpot POI layer suppression:", layer.id, error?.message || error);
    }
  }
}

let loading = null;
function script(src) {
  return new Promise((ok, bad) => {
    const node = document.createElement("script");
    node.src = src;
    node.async = false;
    node.crossOrigin = "anonymous";
    node.onload = () => ok();
    node.onerror = () => bad(Error("지도 라이브러리를 불러올 수 없습니다"));
    document.head.append(node);
  });
}
function libs(L) {
  window.L = L;
  if (!loading)
    loading = (async () => {
      for (const src of scripts) await script(src);
      if (typeof L.maplibreGL !== "function" || !window.maplibregl)
        throw Error("MapLibre Leaflet 연결 실패");
    })().catch((e) => {
      loading = null;
      throw e;
    });
  return loading;
}
// v0.1.4's adapter queues a transition animation which can outlive its
// Leaflet layer: its queued callback then reads this._map.getZoom() after
// Leaflet has detached it. Keep the standard transition behavior, but check
// ownership INSIDE the animation frame instead of only when scheduling.
export function guardMaplibreLayerLifecycle(L, layer) {
  const originalZoomEnd = layer._zoomEnd;
  layer._zoomEnd = function (...args) {
    if (!this._map || !this._glMap) return;
    return originalZoomEnd.apply(this, args);
  };
  layer._transitionEnd = function () {
    L.Util.requestAnimFrame(function () {
      const map = this._map;
      const gl = this._glMap;
      if (!map || !gl || !gl._actualCanvas) return;
      const zoom = map.getZoom();
      const center = map.getCenter();
      const offset = map.latLngToContainerPoint(map.getBounds().getNorthWest());
      this._resizeContainer();
      // A dismissed map must never be resuscitated by a queued resize.
      if (this._map !== map || this._glMap !== gl) return;
      L.DomUtil.setTransform(gl._actualCanvas, offset, 1);
      gl.once("moveend", () => this._zoomEnd());
      gl.jumpTo({ center, zoom: zoom - 1 });
    }, this);
  };
  return layer;
}

export function addBasemap(L, map) {
  window.L = L;
  const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  const wrap = map.getContainer().closest(".map-wrap");
  const state = {
    // Restore the same OpenFreeMap Positron vector style on both web and
    // Android WebView. The native bridge must not change the map design.
    // Leaflet and the existing WebGL teardown guard keep tab switching stable.
    mode: "simple",
    osm,
    gl: null,
    glMap: null,
    alive: true,
    loading: false,
    hasGl: false,
    creditAdded: false,
  };
  if (wrap) {
    wrap.classList.add("rs-map-simple");
    wrap.classList.remove("rs-polished");
  }
  let readyTimer, fallbackTimer;
  function paint() {
    if (!state.alive) return;
    const isVector = state.mode === "simple";
    // Diagnostic lives on the actual Leaflet map element, including timeline
    // cards that do not have a .map-wrap ancestor. Used for Android regression checks.
    map.getContainer().dataset.rsBasemap =
      state.hasGl ? "positron" : isVector ? "loading" : "classic";
    if (wrap) {
      wrap.dataset.rsBase = state.mode;
      wrap.classList.toggle("rs-map-pending", isVector && !state.hasGl);
    }
  }
  function restoreOsm() {
    if (state.creditAdded && map.attributionControl) {
      map.attributionControl.removeAttribution(CREDIT);
      state.creditAdded = false;
    }
    if (!map.hasLayer(osm)) osm.addTo(map);
    if (state.gl) {
      try {
        map.removeLayer(state.gl);
      } catch (e) {}
      state.gl = null;
      state.glMap = null;
    }
    state.hasGl = false;
    paint();
  }
  async function update() {
    if (!state.alive) return;
    const wanted = state.mode;
    if (wanted !== "simple") {
      restoreOsm();
      return;
    }
    if (state.glMap) {
      try {
        state.glMap.setStyle(STYLES[wanted]);
        state.hasGl = true;
        paint();
        return;
      } catch (err) {
        restoreOsm();
      }
    }
    if (state.loading) {
      paint();
      return;
    }
    state.loading = true;
    paint();
    try {
      await libs(L);
      if (!state.alive || state.mode !== "simple") return;
      const layer = L.maplibreGL({
        style: STYLES[state.mode],
        interactive: false,
        attributionControl: false,
      });
      guardMaplibreLayerLifecycle(L, layer);
      const removeVector = layer.onRemove;
      layer.onRemove = function (removingMap) {
        const gl = this.getMaplibreMap();
        const pane = removingMap.getPane(this.getPaneName());
        if (gl && this._container?.parentNode === pane) {
          removeVector.call(this, removingMap);
          return;
        }
        if (gl && removingMap._proxy && removingMap.options.zoomAnimation) {
          L.DomEvent.off(
            removingMap._proxy,
            L.DomUtil.TRANSITION_END,
            this._transitionEnd,
            this,
          );
        }
        this._container?.remove();
        if (gl) gl.remove();
        this._glMap = null;
      };
      state.gl = layer;
      layer.addTo(map);
      const gl = layer.getMaplibreMap();
      state.glMap = gl;
      if (!gl) throw Error("지도 렌더러 생성 실패");
      let done = false;
      const onReady = () => {
        if (done || !state.alive || state.gl !== layer) return;
        done = true;
        state.hasGl = true;
        if (!state.creditAdded && map.attributionControl) {
          map.attributionControl.addAttribution(CREDIT);
          state.creditAdded = true;
        }
        if (map.hasLayer(osm)) map.removeLayer(osm);
        paint();
      };

      function rs47MoreNeighbourhoodNames() {
        if (!state.alive || state.mode !== "simple") return;
        for (const id of [
          "rs46-district-labels",
          "rs46-neighbourhood-labels",
        ]) {
          if (!gl.getLayer(id)) continue;
          try {
            if (id === "rs46-district-labels") {
              gl.setLayerZoomRange(id, 10.1, 24);
              gl.setLayoutProperty(id, "text-padding", 3);
              gl.setLayoutProperty(id, "text-allow-overlap", true);
              gl.setLayoutProperty(id, "text-ignore-placement", true);
            } else {
              gl.setLayerZoomRange(id, 11, 24);
              gl.setLayoutProperty(id, "text-padding", 2);
              gl.setLayoutProperty(id, "text-variable-anchor", [
                "top",
                "bottom",
                "left",
                "right",
              ]);
              gl.setLayoutProperty(id, "text-radial-offset", 0.45);
            }
          } catch (error) {
            console.warn(
              "RiderSpot label priority",
              id,
              error?.message || error,
            );
          }
        }
        // Publicly documented representative places (not administrative centroids).
        // Low-zoom overview only; vector map labels take over when zoomed in.
        const sourceId = "rs47-gwangsan-overview",
          labelId = "rs47-gwangsan-overview-labels";
        if (!gl.getSource(sourceId)) {
          const places = [
            ["운남동", 126.8218941, 35.1730207, 1],
            ["월곡동", 126.8096579, 35.1712284, 2],
            ["수완지구", 126.8102029, 35.193844, 3],
            ["신창동", 126.8408242, 35.1956109, 4],
          ];
          gl.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: places.map(([name, lon, lat, rank]) => ({
                type: "Feature",
                properties: { name, rank },
                geometry: { type: "Point", coordinates: [lon, lat] },
              })),
            },
          });
        }
        if (!gl.getLayer(labelId)) {
          gl.addLayer({
            id: labelId,
            type: "symbol",
            source: sourceId,
            minzoom: 10.7,
            maxzoom: 13.8,
            layout: {
              "text-field": ["get", "name"],
              "text-font": ["Noto Sans Regular"],
              "text-size": [
                "interpolate",
                ["linear"],
                ["zoom"],
                10.7,
                10.5,
                12.5,
                12,
                13.8,
                12.5,
              ],
              "text-anchor": "center",
              "text-padding": 3,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
              "text-variable-anchor": ["top", "bottom", "left", "right"],
              "text-radial-offset": 0.4,
              "symbol-sort-key": ["get", "rank"],
            },
            paint: {
              "text-color": "#35685f",
              "text-halo-color": "#fbfffd",
              "text-halo-width": 2,
              "text-halo-blur": 0.1,
            },
          });
        }
        window.__rsGwangsanOverviewLabelsReady = true;
      }

      function rs46LocalLabels() {
        if (!state.alive || state.mode !== "simple") return;
        const style = gl.getStyle();
        if (!style?.sources?.openmaptiles) return;
        const nameField = [
          "coalesce",
          ["get", "name:ko"],
          ["get", "name:nonlatin"],
          ["get", "name"],
          ["get", "name:latin"],
        ];
        const tiers = [
          {
            id: "rs46-district-labels",
            source: "place",
            classes: ["suburb", "borough", "town"],
            minzoom: 10.7,
            color: "#405d57",
            size: [11, 11.5, 13, 13, 16, 14],
            pad: 8,
          },
          {
            id: "rs46-neighbourhood-labels",
            source: "place",
            classes: ["quarter", "neighbourhood", "village", "hamlet"],
            minzoom: 11.6,
            color: "#556e67",
            size: [11, 10.3, 13, 11.7, 16, 13],
            pad: 5,
          },
          {
            id: "rs46-major-road-labels",
            source: "transportation_name",
            classes: ["trunk", "primary", "secondary", "tertiary"],
            minzoom: 12.6,
            color: "#77837e",
            size: [12, 9.3, 14, 10.7, 16, 12],
            pad: 6,
            road: true,
          },
        ];
        let added = 0;
        for (const tier of tiers) {
          if (gl.getLayer(tier.id)) continue;
          const layer = {
            id: tier.id,
            type: "symbol",
            source: "openmaptiles",
            "source-layer": tier.source,
            minzoom: tier.minzoom,
            filter: ["match", ["get", "class"], tier.classes, true, false],
            layout: {
              "text-field": nameField,
              "text-font": ["Noto Sans Regular"],
              "text-size": ["interpolate", ["linear"], ["zoom"], ...tier.size],
              "text-max-width": 10,
              "text-padding": tier.pad,
              "text-optional": true,
              "text-allow-overlap": false,
              "symbol-sort-key": ["coalesce", ["get", "rank"], 30],
            },
            paint: {
              "text-color": tier.color,
              "text-halo-color": "#f8fbfa",
              "text-halo-width": 1.65,
              "text-halo-blur": 0.15,
            },
          };
          if (tier.road) {
            layer.layout["symbol-placement"] = "line";
            layer.layout["symbol-spacing"] = 400;
            layer.layout["text-max-angle"] = 40;
            delete layer.layout["symbol-sort-key"];
          }
          try {
            gl.addLayer(layer);
            added++;
          } catch (error) {
            console.warn(
              "RiderSpot lower-zoom label layer",
              tier.id,
              error?.message || error,
            );
          }
        }
        if (added) window.__rsLocalLabelsReady = true;
      }

      function restorePlaceNames() {
        if (!state.alive || state.mode !== "simple") return;
        try {
          const design = gl.getStyle();
          if (!design?.sources?.openmaptiles) return;
          // Positron intentionally omits POIs; never re-add generic facility
          // labels from the vector tile source (shelters, fuel, repair, etc.).
          hideBasemapPoiLabels(gl);
          // Keep administrative and road names for navigation context.
          rs46LocalLabels();
          rs47MoreNeighbourhoodNames();
          window.__rsPoiLabelsReady = true;
        } catch (e) {
          console.warn("RiderSpot map labels:", e?.message || e);
        }
      }
      gl.on("style.load", restorePlaceNames);
      gl.once("load", () => {
        if (!state.alive) return;
        restorePlaceNames();
        gl.once("idle", onReady);
        readyTimer = setTimeout(onReady, 1700);
      });
      gl.on("webglcontextlost", () => {
        if (state.alive && state.gl === layer) {
          state.mode = "classic";
          restoreOsm();
        }
      });
      gl.on("error", (event) => {
        if (!state.hasGl)
          console.warn(
            "OpenFreeMap:",
            event?.error?.message || event?.error || "load failed",
          );
      });
      fallbackTimer = setTimeout(() => {
        if (state.alive && state.gl === layer && !state.hasGl) {
          console.warn("Vector map unavailable; switching to the safety basemap");
          state.mode = "classic";
          restoreOsm();
        }
      }, 14000);
    } catch (error) {
      console.warn("Rider Spot map fallback:", error?.message || error);
      state.mode = "classic";
      restoreOsm();
    } finally {
      state.loading = false;
    }
  }
  paint();
  if (state.mode === "simple") update();
  return () => {
    state.alive = false;
    clearTimeout(readyTimer);
    clearTimeout(fallbackTimer);
    if (state.gl) map.removeLayer(state.gl);
  };
}
