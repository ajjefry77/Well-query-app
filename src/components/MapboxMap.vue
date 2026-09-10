<template>
  <div class="map-shell">
    <div ref="mapEl" class="map-el"></div>

    <!-- پنل ابزارها -->
    <div class="tool-panel-wrap">
      <button
        class="tool-toggle-btn"
        @click="panelOpen = !panelOpen"
        :class="{ active: panelOpen || activeMode !== null }"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
          />
        </svg>
        ابزارها
      </button>

      <div class="tool-panel" v-if="panelOpen">
        <!-- انتخاب رنگ -->
        <div class="tool-section-label">رنگ</div>

        <div class="color-custom-wrap">
          <label class="color-custom-input">
            <input
              type="color"
              v-model="selectedColor"
              title="رنگ دلخواه"
            />
            <span
              class="color-preview-dot"
              :style="{ background: selectedColor }"
            ></span>
            <span class="color-custom-label">رنگ دلخواه</span>
          </label>
          <span class="color-hex" dir="ltr">{{ selectedColor }}</span>
        </div>

        <div class="tool-divider"></div>

        <!-- ترسیم -->
        <div class="tool-section-label">ترسیم</div>
        <button
          class="tool-item"
          :class="{ active: activeMode === 'draw' && drawSubTool === 'point' }"
          @click="activateTool('draw', 'point')"
        >
          <span class="tool-icon">●</span> نقطه
        </button>
        <button
          class="tool-item"
          :class="{ active: activeMode === 'draw' && drawSubTool === 'line' }"
          @click="activateTool('draw', 'line')"
        >
          <span class="tool-icon">╱</span> خط
        </button>
        <button
          class="tool-item"
          :class="{
            active: activeMode === 'draw' && drawSubTool === 'polygon',
          }"
          @click="activateTool('draw', 'polygon')"
        >
          <span class="tool-icon">⬡</span> پلیگان
        </button>

        <div class="tool-divider"></div>

        <!-- اندازه‌گیری -->
        <div class="tool-section-label">اندازه‌گیری</div>
        <button
          class="tool-item"
          :class="{
            active: activeMode === 'measure' && drawSubTool === 'line',
          }"
          @click="activateTool('measure', 'line')"
        >
          <span class="tool-icon">↔</span> طول
        </button>
        <button
          class="tool-item"
          :class="{
            active: activeMode === 'measure' && drawSubTool === 'polygon',
          }"
          @click="activateTool('measure', 'polygon')"
        >
          <span class="tool-icon">⊡</span> مساحت
        </button>

        <div class="tool-divider"></div>

        <button class="tool-item danger" @click="clearAll">
          <span class="tool-icon">✕</span> پاک کردن
        </button>
      </div>
    </div>

    <div class="status-bar">
      <div class="status-group">
        <div class="status-chip">
          <span class="label">Lat</span>
          <span class="value">{{ mouse.lat }}</span>

          <span class="divider"></span>

          <span class="label">Lon</span>
          <span class="value">{{ mouse.lng }}</span>
        </div>

        <div class="status-chip">
          <span class="label">UTM</span>
          <span class="value">{{ mouse.utm }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { centerOfMass, length as turfLength, area as turfArea } from "@turf/turf";
import * as utm from "utm";

mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ?? "pk.YOUR_TOKEN_HERE";

if (mapboxgl.getRTLTextPluginStatus() === "unavailable") {
  mapboxgl.setRTLTextPlugin(
      'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js',
      null,
      true // Lazy load the plugin
  );
}

const props = defineProps({
  wells: { type: Array, required: true },
  highlightedIds: { type: Array, default: () => [] },
  hasFilter: { type: Boolean, default: false },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, default: 0 },
  selectedId: { type: [String, Number], default: null },
  theme: { type: String, default: "light" },
});
const emit = defineEmits(["select-well"]);

const mapEl = ref(null);
const panelOpen = ref(false);
const activeMode = ref(null);
const drawSubTool = ref(null);

const selectedColor = ref("#3498db");

let map = null;
let draw = null;
let markers = [];
let labelMarkers = [];
let wellsGeoJSON = null;

const LIGHT_STYLE = "mapbox://styles/aseman1005/ckgamsxfo131a1arvafwa8e5n";
const DARK_STYLE = "mapbox://styles/mapbox/dark-v11";
let lastStyle = props.theme === "dark" ? DARK_STYLE : LIGHT_STYLE;

const mouse = ref({ lat: "", lng: "", utm: "" });

// ─────────────────────────────────────────────────────────
// معماری رنگ per-feature:
//
// MapboxDraw فقط برای رسم interactive استفاده میشه.
// به محض اینکه کاربر شکل رو تموم کرد (draw.create):
//   1. شکل رو از Draw پاک می‌کنیم
//   2. با رنگ انتخاب‌شده (user_color) به drawnFeatures اضافه می‌کنیم
//   3. یه GeoJSON source/layer جداگانه ("drawn-src") این شکل‌ها رو نشون میده
//
// این source از data-driven expression رنگ هر شکل رو از
// property "user_color" می‌خونه → هر شکل رنگ خودش رو داره.
// ─────────────────────────────────────────────────────────

// آرایه شکل‌های تموم‌شده (هر آیتم = GeoJSON Feature با user_color)
let drawnFeatures = [];

// ─── مدیریت drawn-src layer ───────────────────────────────
const DRAWN_SRC = "drawn-src";
const DRAWN_LAYERS = [
  "drawn-polygon-fill",
  "drawn-polygon-stroke",
  "drawn-line",
  "drawn-point",
];

function initDrawnSource() {
  if (map.getSource(DRAWN_SRC)) return;
  map.addSource(DRAWN_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  // پلیگان fill
  map.addLayer({
    id: "drawn-polygon-fill",
    type: "fill",
    source: DRAWN_SRC,
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": ["get", "user_color"],
      "fill-opacity": 0.25,
    },
  });
  // پلیگان stroke
  map.addLayer({
    id: "drawn-polygon-stroke",
    type: "line",
    source: DRAWN_SRC,
    filter: ["==", ["geometry-type"], "Polygon"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "user_color"],
      "line-width": 2,
    },
  });
  // خط
  map.addLayer({
    id: "drawn-line",
    type: "line",
    source: DRAWN_SRC,
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "user_color"],
      "line-width": 2.5,
    },
  });
  // نقطه
  map.addLayer({
    id: "drawn-point",
    type: "circle",
    source: DRAWN_SRC,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 7,
      "circle-color": ["get", "user_color"],
      "circle-stroke-color": "#fff",
      "circle-stroke-width": 2,
    },
  });
}

function refreshDrawnSource() {
  const src = map.getSource(DRAWN_SRC);
  if (!src) return;
  src.setData({ type: "FeatureCollection", features: drawnFeatures });
}

// ─── Draw styles — فقط برای حین رسم (رنگ ثابت = selectedColor) ──
// چون شکل بعد از تموم شدن به drawn-src منتقل میشه،
// لایه‌های static اصلاً استفاده نمیشن.
function makeDrawStyles(color) {
  return [
    {
      id: "gl-draw-polygon-fill",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      paint: { "fill-color": color, "fill-opacity": 0.25 },
    },
    {
      id: "gl-draw-polygon-stroke-active",
      type: "line",
      filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": 2 },
    },
    {
      id: "gl-draw-line",
      type: "line",
      filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": 2.5 },
    },
    {
      id: "gl-draw-polygon-and-line-vertex-active",
      type: "circle",
      filter: [
        "all",
        ["==", "meta", "vertex"],
        ["==", "$type", "Point"],
        ["!=", "mode", "static"],
      ],
      paint: {
        "circle-radius": 5,
        "circle-color": "#fff",
        "circle-stroke-color": color,
        "circle-stroke-width": 2,
      },
    },
    {
      id: "gl-draw-point",
      type: "circle",
      filter: [
        "all",
        ["==", "$type", "Point"],
        ["==", "meta", "feature"],
        ["!=", "mode", "static"],
      ],
      paint: {
        "circle-radius": 7,
        "circle-color": color,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    },
    {
      id: "gl-draw-polygon-midpoint",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
      paint: {
        "circle-radius": 4,
        "circle-color": color,
        "circle-opacity": 0.6,
      },
    },
    // static layers خالی — شکل‌ها بلافاصله به drawn-src منتقل میشن
    {
      id: "gl-draw-polygon-fill-static",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
      paint: { "fill-color": color, "fill-opacity": 0 },
    },
    {
      id: "gl-draw-polygon-stroke-static",
      type: "line",
      filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
      paint: { "line-color": color, "line-width": 0 },
    },
    {
      id: "gl-draw-line-static",
      type: "line",
      filter: ["all", ["==", "$type", "LineString"], ["==", "mode", "static"]],
      paint: { "line-color": color, "line-width": 0 },
    },
    {
      id: "gl-draw-point-static",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "mode", "static"]],
      paint: { "circle-radius": 0, "circle-color": color },
    },
  ];
}

// ─── label اندازه‌گیری ─────────────────────────────────────
function clearLabelMarkers() {
  labelMarkers.forEach((m) => m.remove());
  labelMarkers = [];
}

function makeLabelEl(text) {
  const el = document.createElement("div");
  el.className = "measure-label";
  el.textContent = text;
  return el;
}

function formatLength(km) {
  return km >= 1 ? `${km.toFixed(3)} km` : `${(km * 1000).toFixed(1)} m`;
}
function formatArea(m2) {
  return m2 >= 1_000_000
    ? `${(m2 / 1_000_000).toFixed(3)} km²`
    : `${m2.toFixed(1)} m²`;
}

function getFeatureCenter(feature) {
  try {
    return centerOfMass(feature).geometry.coordinates;
  } catch {
    return null;
  }
}

function updateLabels() {
  if (activeMode.value !== "measure") return;
  clearLabelMarkers();
  // label از drawnFeatures (نه از draw)
  drawnFeatures.forEach((f) => {
    let text = null;
    if (f.geometry.type === "LineString" && f.geometry.coordinates.length >= 2)
      text = formatLength(turfLength(f, { units: "kilometers" }));
    else if (
      f.geometry.type === "Polygon" &&
      f.geometry.coordinates[0]?.length >= 4
    )
      text = formatArea(turfArea(f));
    if (!text) return;
    const center = getFeatureCenter(f);
    if (!center) return;
    labelMarkers.push(
      new mapboxgl.Marker({ element: makeLabelEl(text), anchor: "center" })
        .setLngLat(center)
        .addTo(map),
    );
  });
}

function updateLiveLabel() {
  if (activeMode.value !== "measure") return;
  const liveFeatures = map
    .querySourceFeatures("mapbox-gl-draw-cold")
    .concat(map.querySourceFeatures("mapbox-gl-draw-hot"));
  const live = liveFeatures.find(
    (f) =>
      (f.geometry.type === "LineString" &&
        f.geometry.coordinates.length >= 2) ||
      (f.geometry.type === "Polygon" && f.geometry.coordinates[0]?.length >= 3),
  );
  const existing = document.getElementById("live-measure-label");
  if (existing) existing.remove();
  if (!live) return;
  let text = null;
  if (live.geometry.type === "LineString")
    text = formatLength(turfLength(live, { units: "kilometers" }));
  else if (live.geometry.type === "Polygon") {
    try {
      const a = turfArea(live);
      if (a > 0) text = formatArea(a);
    } catch {}
  }
  if (!text) return;
  const center = getFeatureCenter(live);
  if (!center) return;
  const el = makeLabelEl(text);
  el.id = "live-measure-label";
  new mapboxgl.Marker({ element: el, anchor: "center" })
    .setLngLat(center)
    .addTo(map);
}

// ─── مدیریت Draw instance ──────────────────────────────────
function getDrawMode(subTool) {
  if (subTool === "point") return "draw_point";
  if (subTool === "line") return "draw_line_string";
  if (subTool === "polygon") return "draw_polygon";
  return null;
}

function createDrawInstance(mode, subTool) {
  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: {},
    styles: makeDrawStyles(selectedColor.value),
  });
  map.addControl(draw, "top-left");

  map.on("draw.create", onDrawCreate);
  map.on("draw.render", onDrawRender);
}

function removeDraw() {
  map.off("draw.create", onDrawCreate);
  map.off("draw.render", onDrawRender);
  try {
    if (draw && map.hasControl(draw)) map.removeControl(draw);
  } catch {}
  draw = null;
}

function activateTool(mode, subTool) {
  // toggle: همان ابزار → غیرفعال
  if (activeMode.value === mode && drawSubTool.value === subTool) {
    deactivateAll();
    return;
  }

  // draw وجود داره و فقط subTool عوض شده (همون mode) → فقط changeMode
  if (draw && map.hasControl(draw) && activeMode.value === mode) {
    drawSubTool.value = subTool;
    requestAnimationFrame(() => {
      if (!draw) return;
      draw.changeMode(getDrawMode(subTool));
    });
    return;
  }

  // اولین بار یا تغییر mode اصلی (draw↔measure)
  if (draw && map.hasControl(draw)) removeDraw();
  activeMode.value = mode;
  drawSubTool.value = subTool;
  createDrawInstance(mode, subTool);
  requestAnimationFrame(() => {
    if (!draw) return;
    draw.changeMode(getDrawMode(subTool));
  });
}

function onDrawCreate(e) {
  const color = selectedColor.value;

  // شکل رو از Draw پاک کن و به drawn-src اضافه کن
  e.features.forEach((f) => {
    draw.delete(f.id);
    drawnFeatures.push({
      type: "Feature",
      id: f.id,
      geometry: f.geometry,
      properties: { ...f.properties, user_color: color },
    });
  });
  refreshDrawnSource();

  const live = document.getElementById("live-measure-label");
  if (live) live.remove();
  updateLabels();

  // بعد از ثبت شکل، دوباره mode رو فعال کن
  requestAnimationFrame(() => {
    if (!draw) return;
    draw.changeMode(getDrawMode(drawSubTool.value));
  });
}

function onDrawRender() {
  if (activeMode.value === "measure") updateLiveLabel();
}

function deactivateAll() {
  removeDraw();
  clearLabelMarkers();
  const live = document.getElementById("live-measure-label");
  if (live) live.remove();
  activeMode.value = null;
  drawSubTool.value = null;
  map.getCanvas().style.cursor = "";
}

function clearAll() {
  drawnFeatures = [];
  refreshDrawnSource();
  clearLabelMarkers();
  const live = document.getElementById("live-measure-label");
  if (live) live.remove();
  // mode رو دوباره فعال کن
  requestAnimationFrame(() => {
    if (!draw || !drawSubTool.value) return;
    draw.changeMode(getDrawMode(drawSubTool.value));
  });
}

// ─── رندر عوارض ───────────────────────────────────────────
const WELL_COLOR = "#7ec88a";

// کلید یکتا: شناسه‌ها ممکن است بین لایه‌ها تکراری باشند
function wellKey(w) {
  if (!w) return null;
  const id = w.id ?? w.properties?.id;
  if (id == null || id === "") return null;
  const lu = w._layerUuid ?? w.properties?._layerUuid;
  return lu ? `${lu}::${id}` : String(id);
}
function inHighlightSet(key, highlightSet) {
  if (!key) return false;
  if (highlightSet.has(key)) return true;
  const i = key.indexOf("::");
  if (i >= 0 && highlightSet.has(key.slice(i + 2))) return true;
  return false;
}

function buildGeoJSON(wells) {
  return {
    type: "FeatureCollection",
    features: wells
      .filter((w) => w._geometry || (Number.isFinite(+w.lat) && Number.isFinite(+w.lng)))
      .map((w) => ({
        type: "Feature",
        geometry: w._geometry ?? { type: "Point", coordinates: [+w.lng, +w.lat] },
        properties: { ...w, _geometry: undefined },
      })),
  };
}

function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
}

function clearWellLayers() {
  ["wells-fill", "wells-line", "wells-polyline", "wells-point"].forEach(
    (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
  );
  if (map.getSource("wells-src")) map.removeSource("wells-src");
}

function popupHTML(w, props_) {
  const entries = Object.entries(props_)
    .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
    .slice(0, 8)
    .map(
      ([k, v]) =>
        `<tr><td class="wqa-popup__key">${k}</td><td class="wqa-popup__val">${v ?? "—"}</td></tr>`,
    )
    .join("");
  return `<div class="wqa-popup">
    <div class="wqa-popup__title">عارضه #${w.id}</div>
    <table class="wqa-popup__table">${entries}</table>
  </div>`;
}

let wellsEventsBound = false;
function bindWellEventsOnce() {
  if (wellsEventsBound) return;
  wellsEventsBound = true;
  ["wells-fill", "wells-line", "wells-polyline", "wells-point"].forEach(
    (layerId) => {
      map.on("click", layerId, (e) => {
        if (activeMode.value) return;
        const fp = e.features[0].properties;
        const fpKey = wellKey({ properties: fp, id: fp.id });
        const well = props.wells.find((w) => wellKey(w) === fpKey)
          ?? props.wells.find((w) => String(w.id) === String(fp.id));
        if (!well) return;
        emit("select-well", well);
        new mapboxgl.Popup({ maxWidth: "280px" })
          .setLngLat(e.lngLat)
          .setHTML(popupHTML(well, fp))
          .addTo(map);
      });
      map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
      });
    },
  );
}

function fitGeoJSON(geojson) {
  try {
    const bounds = new mapboxgl.LngLatBounds();
    geojson.features.forEach((f) => {
      const g = f.geometry;
      if (g.type === "Point") bounds.extend(g.coordinates);
      else if (g.type === "MultiPoint")
        g.coordinates.forEach((c) => bounds.extend(c));
      else if (g.type === "LineString")
        g.coordinates.forEach((c) => bounds.extend(c));
      else if (g.type === "MultiLineString")
        g.coordinates.forEach((l) => l.forEach((c) => bounds.extend(c)));
      else if (g.type === "Polygon")
        g.coordinates[0].forEach((c) => bounds.extend(c));
      else if (g.type === "MultiPolygon")
        g.coordinates.forEach((p) => p[0].forEach((c) => bounds.extend(c)));
    });
    if (!bounds.isEmpty())
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 800 });
  } catch {}
}

function renderMarkers(fit = true) {
  if (!map || !map.isStyleLoaded()) return;
  const highlightSet = new Set((props.highlightedIds || []).map(String));
  const centerKey = wellKey(props.radiusCenter);
  const selectedKey = props.selectedId != null && props.selectedId !== '' ? String(props.selectedId) : null;
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    clearMarkers();
    const geojson = buildGeoJSON(props.wells);
    wellsGeoJSON = geojson;
    geojson.features.forEach((f) => {
      const key = wellKey(f);
      const hl = inHighlightSet(key, highlightSet);
      const match = props.hasFilter && hl;
      f.properties._color = WELL_COLOR;
      f.properties._highlighted = hl ? 1 : 0;
      f.properties._dimmed = props.hasFilter && !hl ? 1 : 0;
      f.properties._match = match ? 1 : 0;
      f.properties._isCenter =
        centerKey && key === centerKey ? 1 : 0;
      f.properties._selected =
        selectedKey && (key === selectedKey || String(f.properties.id) === selectedKey) ? 1 : 0;
    });
    // استفاده مجدد از source/layer (بدون بازسازی و بدون fit اضافه)
    if (map.getSource("wells-src")) {
      map.getSource("wells-src").setData(geojson);
    } else {
    map.addSource("wells-src", { type: "geojson", data: geojson });
    map.addLayer({
      id: "wells-fill",
      type: "fill",
      source: "wells-src",
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "fill-color": [
          "case",
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1],
          "#22c55e", // داخل کوئری → سبز مشخص
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e", // فیلتر شده → رنگ
          "#8a9490", // عادی → خاکستری
        ],
        "fill-opacity": [
          "case",
          ["==", ["get", "_selected"], 1],
          0.6,
          ["==", ["get", "_isCenter"], 1],
          0.55,
          ["==", ["get", "_match"], 1],
          0.65,
          ["==", ["get", "_highlighted"], 1],
          0.55,
          ["==", ["get", "_dimmed"], 1],
          0.06,
          0.2, // عادی بدون فیلتر
        ],
      },
    });
    map.addLayer({
      id: "wells-line",
      type: "line",
      source: "wells-src",
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1],
          "#14532d",
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e",
          "#8a9490",
        ],
        "line-width": [
          "case",
          ["==", ["get", "_selected"], 1],
          4,
          ["==", ["get", "_isCenter"], 1],
          4,
          ["==", ["get", "_match"], 1],
          3.5,
          ["==", ["get", "_highlighted"], 1],
          3,
          1.5,
        ],
        "line-opacity": [
          "case",
          ["==", ["get", "_selected"], 1],
          1,
          ["==", ["get", "_highlighted"], 1],
          1,
          ["==", ["get", "_dimmed"], 1],
          0.15,
          0.5,
        ],
      },
    });
    map.addLayer({
      id: "wells-polyline",
      type: "line",
      source: "wells-src",
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["LineString", "MultiLineString"]],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": [
          "case",
          ["==", ["get", "_selected"], 1],
          4,
          ["==", ["get", "_isCenter"], 1],
          4,
          ["==", ["get", "_match"], 1],
          3.5,
          ["==", ["get", "_highlighted"], 1],
          3,
          ["==", ["get", "_dimmed"], 1],
          1,
          1.5,
        ],
        "line-color": [
          "case",
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1],
          "#22c55e",
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e",
          "#8a9490",
        ],
        "line-opacity": ["case", ["==", ["get", "_dimmed"], 1], 0.25, 1],
      },
    });
    map.addLayer({
      id: "wells-point",
      type: "circle",
      source: "wells-src",
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "_selected"], 1],
          12,
          ["==", ["get", "_isCenter"], 1],
          12,
          ["==", ["get", "_match"], 1],
          11,
          ["==", ["get", "_highlighted"], 1],
          9,
          ["==", ["get", "_dimmed"], 1],
          4,
          6,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1],
          "#22c55e",
          ["==", ["get", "_dimmed"], 1],
          "#8a9490",
          ["get", "_color"],
        ],
        "circle-opacity": [
          "case",
          ["==", ["get", "_selected"], 1],
          1,
          ["==", ["get", "_isCenter"], 1],
          1,
          ["==", ["get", "_dimmed"], 1],
          0.3,
          1,
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "_selected"], 1],
          3,
          ["==", ["get", "_isCenter"], 1],
          3,
          2,
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "_selected"], 1],
          "#1a1a1a",
          ["==", ["get", "_isCenter"], 1],
          "#fff",
          ["==", ["get", "_match"], 1],
          "#14532d",
          ["==", ["get", "_highlighted"], 1],
          "#1a1a1a",
          ["==", ["get", "_dimmed"], 1],
          "#666",
          "#ffffff",
        ],
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "_selected"], 1],
          1,
          ["==", ["get", "_isCenter"], 1],
          1,
          ["==", ["get", "_dimmed"], 1],
          0.3,
          1,
        ],
      },
    });
    bindWellEventsOnce();
    }
    if (fit) fitGeoJSON(geojson);
  } else {
    clearWellLayers();
    clearMarkers();
    wellsGeoJSON = null;
    props.wells.forEach((w) => {
      if (!Number.isFinite(+w.lat) || !Number.isFinite(+w.lng)) return;
      const key = wellKey(w);
      const isH = inHighlightSet(key, highlightSet);
      const isDimmed = props.hasFilter && !isH;
      const isMatch = props.hasFilter && isH;
      const isCenter = centerKey && key === centerKey;
      const isSel = selectedKey && (key === selectedKey || String(w.id) === selectedKey);
      const color = isSel
        ? "#f0a500"
        : isCenter
          ? "#e74c3c"
          : isMatch
            ? "#22c55e"
            : isH
              ? "#4a9b8e"
              : "#8a9490";
      const opacity = isSel || isCenter || isMatch ? "1" : isDimmed ? "0.25" : "1";
      const border = isSel
        ? "3px solid #1a1a1a"
        : isCenter
          ? "3px solid #fff"
          : isMatch
            ? "3px solid #14532d"
            : isH
              ? "3px solid #fff"
              : "2px solid rgba(255,255,255,0.4)";
      const size = isSel ? 22 : isCenter ? 22 : isMatch ? 20 : isH ? 18 : isDimmed ? 8 : 12;
      const el = document.createElement("div");
      el.style.cssText = `
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${border};
      box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;
      opacity:${opacity};
      ${isSel || isCenter || isMatch ? "outline:3px solid rgba(34,197,94,0.45);outline-offset:3px;" : (isH ? "outline:3px solid rgba(240,165,0,0.4);outline-offset:3px;" : "")}`;
      const entries = Object.entries(w)
        .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
        .slice(0, 8)
        .map(
          ([k, v]) =>
            `<tr><td class="wqa-popup__key">${k}</td><td class="wqa-popup__val">${v ?? "—"}</td></tr>`,
        )
        .join("");
      const popup = new mapboxgl.Popup({ offset: 14, maxWidth: "280px" })
        .setHTML(`
        <div class="wqa-popup">
          <div class="wqa-popup__title">عارضه #${w.id}</div>
          <table class="wqa-popup__table">${entries}</table>
        </div>`);
      el.addEventListener("click", (e) => {
        if (activeMode.value) {
          e.stopPropagation();
          return;
        }
        emit("select-well", w);
      });
      markers.push(
        new mapboxgl.Marker(el)
          .setLngLat([w.lng, w.lat])
          .setPopup(popup)
          .addTo(map),
      );
    });
    const pts = props.wells.filter((w) => Number.isFinite(+w.lat) && Number.isFinite(+w.lng));
    if (pts.length) {
      const bounds = new mapboxgl.LngLatBounds();
      pts.forEach((w) => bounds.extend([+w.lng, +w.lat]));
      if (fit) map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 800 });
    }
  }
}

// ─── mount ─────────────────────────────────────────────────
let mouseRafPending = false;
function onMouseMove(e) {
  if (mouseRafPending) return;
  mouseRafPending = true;
  requestAnimationFrame(() => {
    mouseRafPending = false;
    mouse.value.lat = e.lngLat.lat.toFixed(6);
    mouse.value.lng = e.lngLat.lng.toFixed(6);
    const p = utm.fromLatLon(e.lngLat.lat, e.lngLat.lng);
    mouse.value.utm = `Zone ${p.zoneNum}${p.zoneLetter} | E ${p.easting.toFixed(2)} | N ${p.northing.toFixed(2)}`;
    if (activeMode.value === "measure") updateLiveLabel();
  });
}

onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value,
    style: lastStyle,
    center: [53, 32],
    zoom: 5,
    attributionControl: false,
  });
  map.addControl(new mapboxgl.NavigationControl(), "bottom-left");
  map.on("load", () => {
    initDrawnSource();
    map.on("mousemove", onMouseMove);
    renderMarkers();
  });
});

onBeforeUnmount(() => {
  clearMarkers();
  clearLabelMarkers();
  if (map) map.remove();
});

watch(() => props.wells, () => renderMarkers(true));

// وقتی فقط highlight یا filter عوض شد، فقط data رو آپدیت کن (سریع‌تر از renderMarkers کامل)
function updateHighlightData() {
  if (!map || !map.isStyleLoaded()) return;
  if (!wellsGeoJSON || !map.getSource("wells-src")) {
    // اگه source نیست (مثلاً marker-based)، کامل render کن ولی بدون fit تا نقشه نپرد
    renderMarkers(false);
    return;
  }
  const highlightSet = new Set((props.highlightedIds || []).map(String));
  const centerKey = wellKey(props.radiusCenter);
  const selectedKey = props.selectedId != null && props.selectedId !== '' ? String(props.selectedId) : null;
  wellsGeoJSON.features.forEach((f) => {
    const key = wellKey(f);
    const hl = inHighlightSet(key, highlightSet);
    f.properties._highlighted = hl ? 1 : 0;
    f.properties._dimmed = props.hasFilter && !hl ? 1 : 0;
    f.properties._match = (props.hasFilter && hl) ? 1 : 0;
    f.properties._isCenter =
      centerKey && key === centerKey ? 1 : 0;
    f.properties._selected =
      selectedKey && (key === selectedKey || String(f.properties.id) === selectedKey) ? 1 : 0;
  });
  map.getSource("wells-src").setData(wellsGeoJSON);
}

watch(() => props.highlightedIds, updateHighlightData);
watch(() => props.hasFilter, updateHighlightData);
watch(() => props.selectedId, updateHighlightData);
// عارضه مرجع (قرمز) با تغییر انتخاب به‌روز می‌شود
watch(() => props.radiusCenter, () => {
  updateHighlightData();
});

// ─── تعویض تم نقشه (روشن ↔ تیره) ──────────────────────────
function applyMapTheme(t) {
  if (!map) return;
  const next = t === "dark" ? DARK_STYLE : LIGHT_STYLE;
  if (next === lastStyle) return;
  lastStyle = next;

  const wasActive = activeMode.value !== null;
  const mode = activeMode.value;
  const sub = drawSubTool.value;
  if (draw && map.hasControl(draw)) removeDraw();

  map.setStyle(next);
  wellsEventsBound = false;
  map.once("style.load", () => {
    initDrawnSource();
    refreshDrawnSource();
    renderMarkers(false);
    updateLabels();
    if (wasActive) {
      activeMode.value = mode;
      drawSubTool.value = sub;
      createDrawInstance(mode, sub);
      requestAnimationFrame(() => {
        if (!draw) return;
        draw.changeMode(getDrawMode(sub));
      });
    }
  });
}
watch(() => props.theme, applyMapTheme);

// ─── expose ────────────────────────────────────────────────
defineExpose({
  invalidateSize() {
    if (map) map.resize();
  },
  zoomToFeature(id) {
    if (!map) return;
    const key = String(id);
    const well = props.wells.find((w) => wellKey(w) === key)
      ?? props.wells.find((w) => String(w.id) === key);
    if (!well) return;
    if (well._geometry) {
      const g = well._geometry;
      if (g.type === "Point") {
        map.flyTo({ center: g.coordinates, zoom: 13, duration: 800 });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      if (g.type === "LineString")
        g.coordinates.forEach((c) => bounds.extend(c));
      else if (g.type === "MultiLineString")
        g.coordinates.forEach((l) => l.forEach((c) => bounds.extend(c)));
      else if (g.type === "Polygon")
        g.coordinates[0].forEach((c) => bounds.extend(c));
      else if (g.type === "MultiPolygon")
        g.coordinates.forEach((p) => p[0].forEach((c) => bounds.extend(c)));
      if (!bounds.isEmpty())
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
    } else if (well.lat && well.lng)
      map.flyTo({ center: [well.lng, well.lat], zoom: 13, duration: 800 });
  },
  zoomToLayer(uuid) {
    if (!map) return;
    const feats = props.wells.filter((w) => String(w._layerUuid) === String(uuid));
    if (!feats.length) return;
    const bounds = new mapboxgl.LngLatBounds();
    let has = false;
    const extend = (c) => {
      if (Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1])) {
        try { bounds.extend([+c[0], +c[1]]); has = true; } catch {}
      }
    };
    const walk = (coords) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number") extend(coords);
      else coords.forEach(walk);
    };
    feats.forEach((w) => {
      if (w._geometry?.coordinates) {
        try { walk(w._geometry.coordinates); } catch {}
      } else if (Number.isFinite(+w.lat) && Number.isFinite(+w.lng)) {
        try { bounds.extend([+w.lng, +w.lat]); has = true; } catch {}
      }
    });
    if (has && !bounds.isEmpty())
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
  },
  enablePointPicker(callback) {
    if (!map) return;
    map.getCanvas().style.cursor = "crosshair";
    const wl = ["wells-fill", "wells-line", "wells-polyline", "wells-point"];
    wl.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    });
    const handler = (e) => {
      wl.forEach((id) => {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", "visible");
      });
      map.getCanvas().style.cursor = "";
      map.off("click", handler);
      if (map._pickerMarker) map._pickerMarker.remove();
      const el = document.createElement("div");
      el.style.cssText =
        "width:16px;height:16px;border-radius:50%;background:#4a9b8e;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);pointer-events:none;";
      map._pickerMarker = new mapboxgl.Marker(el)
        .setLngLat(e.lngLat)
        .addTo(map);
      callback({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on("click", handler);
    map._pickerHandler = handler;
  },
  disablePointPicker() {
    if (!map) return;
    map.getCanvas().style.cursor = "";
    if (map._pickerHandler) {
      map.off("click", map._pickerHandler);
      map._pickerHandler = null;
    }
    if (map._pickerMarker) {
      map._pickerMarker.remove();
      map._pickerMarker = null;
    }
    ["wells-fill", "wells-line", "wells-polyline", "wells-point"].forEach(
      (id) => {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", "visible");
      },
    );
  },
});
</script>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
}
.map-el {
  width: 100%;
  height: 100%;
  background: var(--bg-deep);
}

.tool-panel-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 500;
}
.tool-toggle-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  color: var(--text-primary);
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  transition: background 0.15s, box-shadow 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.tool-toggle-btn:hover {
  background: var(--bg-panel-raised);
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
.tool-toggle-btn.active {
  border-color: var(--accent-depth);
  color: var(--accent-depth);
}
.tool-toggle-btn.active svg {
  stroke: var(--accent-depth);
}

.tool-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: color-mix(in srgb, var(--bg-panel) 96%, transparent);
  backdrop-filter: blur(10px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 8px 6px;
  min-width: 150px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tool-section-label {
  font-size: 10px;
  font-family: "Vazirmatn", sans-serif;
  color: var(--text-muted);
  padding: 4px 8px 2px;
  text-align: right;
}
.tool-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 4px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  font-size: 12px;
  font-family: "Vazirmatn", sans-serif;
  cursor: pointer;
  text-align: right;
  direction: rtl;
  transition:
    background 0.12s,
    color 0.12s;
  color: var(--text-primary);
}
.tool-item:hover {
  background: var(--bg-hover);
  color: var(--accent-depth);
}
.tool-item.active {
  background: color-mix(in srgb, var(--accent-depth) 12%, transparent);
  color: var(--accent-depth);
  font-weight: 600;
}
.tool-item.danger {
  color: var(--accent-danger);
}
.tool-item.danger:hover {
  background: color-mix(in srgb, var(--accent-danger) 8%, transparent);
}
.tool-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

.color-custom-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 8px;
}
.color-custom-input {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-input);
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  flex: 1;
}
.color-custom-input:hover {
  border-color: var(--accent-depth);
  background: color-mix(in srgb, var(--accent-depth) 6%, var(--bg-input));
}
.color-custom-input input[type="color"] {
  width: 0;
  height: 0;
  opacity: 0;
  position: absolute;
}
.color-preview-dot {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-panel);
}
.color-custom-label {
  font-size: 11px;
  font-family: "Vazirmatn", sans-serif;
  color: var(--text-muted);
}
.color-hex {
  font-family: "JetBrains Mono", monospace;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  flex-shrink: 0;
}

.status-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 42px;

  display: flex;
  align-items: center;
  justify-content: flex-end;

  padding: 0 14px;

  background: color-mix(in srgb, var(--bg-panel) 74%, transparent);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--border-subtle);

  z-index: 999;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-chip {
  display: flex;
  align-items: center;
  gap: 8px;

  padding: 6px 12px;

  background: color-mix(in srgb, var(--bg-panel) 82%, transparent);
  border: 1px solid var(--border-subtle);

  border-radius: var(--radius-full);

  backdrop-filter: blur(6px);

  color: var(--text-primary);

  font-size: 12px;
  font-family: monospace;
}

.status-chip .label {
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.3px;
}

.status-chip .value {
  color: var(--text-primary);
}

.divider {
  width: 1px;
  height: 14px;
  background: var(--border-strong);
  margin: 0 2px;
}

:deep(.measure-label) {
  background: rgba(26, 26, 26, 0.82);
  color: #fff;
  font-size: 11px;
  font-family: monospace;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
}

@media (max-width: 760px) {
  .status-bar {
    height: 36px;
    padding: 0 8px;
    overflow-x: auto;
  }
  .status-chip {
    padding: 4px 8px;
    font-size: 10px;
    white-space: nowrap;
  }
  .status-group { gap: 6px; }
}
</style>
