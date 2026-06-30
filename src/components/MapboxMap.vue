<template>
  <div class="map-shell">
    <div ref="mapEl" class="map-el"></div>

    <!-- <div class="map-info" v-if="wells.length">
      <span class="mono">{{ wells.length }} عارضه</span>
    </div> -->

    <!-- پنل ابزارها -->
    <div class="tool-panel-wrap">
      <button
        class="tool-toggle-btn"
        @click="panelOpen = !panelOpen"
        :class="{ active: activeMode !== null }"
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
        <div class="color-row">
          <button
            v-for="c in presetColors"
            :key="c"
            class="color-dot"
            :style="{
              background: c,
              outline: selectedColor === c ? `3px solid ${c}` : 'none',
              outlineOffset: '2px',
            }"
            @click="selectedColor = c"
          />
          <input
            type="color"
            class="color-custom"
            v-model="selectedColor"
            title="رنگ دلخواه"
          />
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
import * as turf from "@turf/turf";
import * as utm from "utm";

mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ?? "pk.YOUR_TOKEN_HERE";

const props = defineProps({
  wells: { type: Array, required: true },
  highlightedIds: { type: Array, default: () => [] },
  hasFilter: { type: Boolean, default: false },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, default: 0 },
  neighborPairs: { type: Array, default: () => [] },
});
const emit = defineEmits(["select-well"]);

const mapEl = ref(null);
const panelOpen = ref(false);
const activeMode = ref(null);
const drawSubTool = ref(null);

const presetColors = [
  "#e74c3c",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#3498db",
  "#9b59b6",
  "#1a1a1a",
];
const selectedColor = ref("#3498db");

let map = null;
let draw = null;
let markers = [];
let labelMarkers = [];

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
    return turf.centerOfMass(feature).geometry.coordinates;
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
      text = formatLength(turf.length(f, { units: "kilometers" }));
    else if (
      f.geometry.type === "Polygon" &&
      f.geometry.coordinates[0]?.length >= 4
    )
      text = formatArea(turf.area(f));
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
    text = formatLength(turf.length(live, { units: "kilometers" }));
  else if (live.geometry.type === "Polygon") {
    try {
      const a = turf.area(live);
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
  const controls =
    mode === "draw"
      ? { point: true, line_string: true, polygon: true, trash: true }
      : {
          line_string: subTool === "line",
          polygon: subTool === "polygon",
          trash: true,
        };

  draw = new MapboxDraw({
    displayControlsDefault: false,
    controls,
    styles: makeDrawStyles(selectedColor.value),
  });
  map.addControl(draw, "top-left");

  map.on("draw.create", onDrawCreate);
  map.on("draw.delete", onDrawDelete);
  map.on("draw.render", onDrawRender);
}

function removeDraw() {
  map.off("draw.create", onDrawCreate);
  map.off("draw.delete", onDrawDelete);
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

function onDrawDelete() {
  // اگر کسی از trash button خود draw استفاده کرد — نادیده بگیر
  // (پاک کردن ما از clearAll هندل میشه)
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
const COLORS_WELL = ["#7ec88a"];
function colorForId(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return COLORS_WELL[hash % COLORS_WELL.length];
}

function buildGeoJSON(wells) {
  return {
    type: "FeatureCollection",
    features: wells
      .filter((w) => w._geometry)
      .map((w) => ({
        type: "Feature",
        geometry: w._geometry,
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
        `<tr><td style="color:#9aab9f;padding:2px 8px 2px 0">${k}</td><td>${v ?? "—"}</td></tr>`,
    )
    .join("");
  return `<div style="font-family:'Vazirmatn',sans-serif;direction:rtl;min-width:200px">
    <div style="font-weight:700;margin-bottom:6px;font-size:13px">عارضه #${w.id}</div>
    <table style="font-size:12px;line-height:1.8;width:100%">${entries}</table>
  </div>`;
}

function renderMarkers() {
  if (!map) return;
  clearMarkers();
  clearWellLayers();
  const highlightSet = new Set(props.highlightedIds.map(String));
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    const geojson = buildGeoJSON(props.wells);
    geojson.features.forEach((f) => {
      const hl = highlightSet.has(String(f.properties.id));
      f.properties._color = colorForId(f.properties.id);
      f.properties._highlighted = hl ? 1 : 0;
      f.properties._dimmed = props.hasFilter && !hl ? 1 : 0;
    });
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
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e", // فیلتر شده → رنگ
          "#8a9490", // عادی → خاکستری
        ],
        "fill-opacity": [
          "case",
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
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e",
          "#8a9490",
        ],
        "line-width": ["case", ["==", ["get", "_highlighted"], 1], 3, 1.5],
        "line-opacity": [
          "case",
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
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "_highlighted"], 1],
          9,
          ["==", ["get", "_dimmed"], 1],
          4,
          6,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e",
          "#8a9490",
        ],
        "circle-opacity": ["case", ["==", ["get", "_dimmed"], 1], 0.25, 1],
        "circle-stroke-width": 2,
        "circle-stroke-color": [
          "case",
          ["==", ["get", "_highlighted"], 1],
          "#fff",
          ["==", ["get", "_dimmed"], 1],
          "#666",
          "#fff",
        ],
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "_dimmed"], 1],
          0.25,
          0.6, // عادی: stroke کمرنگ
        ],
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
          ["==", ["get", "_highlighted"], 1],
          9,
          ["==", ["get", "_dimmed"], 1],
          4,
          6,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "_dimmed"], 1],
          "#8a9490",
          ["get", "_color"],
        ],
        "circle-opacity": ["case", ["==", ["get", "_dimmed"], 1], 0.3, 1],
        "circle-stroke-width": 2,
        "circle-stroke-color": [
          "case",
          ["==", ["get", "_highlighted"], 1],
          "#1a1a1a",
          ["==", ["get", "_dimmed"], 1],
          "#666",
          "#ffffff",
        ],
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "_dimmed"], 1],
          0.3,
          1,
        ],
      },
    });
    ["wells-fill", "wells-line", "wells-polyline", "wells-point"].forEach(
      (layerId) => {
        map.on("click", layerId, (e) => {
          if (activeMode.value) return;
          const fp = e.features[0].properties;
          const well = props.wells.find((w) => String(w.id) === String(fp.id));
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
  } else {
    props.wells.forEach((w) => {
      if (!w.lat || !w.lng) return;
      const isH = highlightSet.has(String(w.id));
      const isDimmed = props.hasFilter && !isH;
      const color = isH ? "#4a9b8e" : "#8a9490";
      const opacity = isDimmed ? "0.25" : isH ? "1" : "0.7";
      const border = isH ? "3px solid #fff" : "2px solid rgba(255,255,255,0.4)";
      const size = isH ? 18 : isDimmed ? 8 : 12;
      const el = document.createElement("div");
      el.style.cssText = `
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:${border};
      box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;
      opacity:${opacity};
      ${isH ? "outline:3px solid rgba(74,155,142,0.35);outline-offset:3px;" : ""}`;
      const entries = Object.entries(w)
        .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
        .slice(0, 8)
        .map(
          ([k, v]) =>
            `<tr><td style="color:#9aab9f;padding:2px 8px 2px 0">${k}</td><td>${v ?? "—"}</td></tr>`,
        )
        .join("");
      const popup = new mapboxgl.Popup({ offset: 14, maxWidth: "280px" })
        .setHTML(`
        <div style="font-family:'Vazirmatn',sans-serif;direction:rtl;min-width:200px">
          <div style="font-weight:700;margin-bottom:6px;font-size:13px">عارضه #${w.id}</div>
          <table style="font-size:12px;line-height:1.8;width:100%">${entries}</table>
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
    const pts = props.wells.filter((w) => w.lat && w.lng);
    if (pts.length) {
      const bounds = new mapboxgl.LngLatBounds();
      pts.forEach((w) => bounds.extend([w.lng, w.lat]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 800 });
    }
  }
}

function renderRadiusAndLines() {
  if (!map || !map.isStyleLoaded()) return;
  ["radius-fill", "radius-line", "center-point", "neighbor-lines"].forEach(
    (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
  );
  ["radius-src", "center-src", "neighbor-src"].forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });
  if (props.radiusCenter && props.radiusKm > 0) {
    const circle = makeCirclePolygon(props.radiusCenter, props.radiusKm);
    map.addSource("radius-src", {
      type: "geojson",
      data: { type: "Feature", geometry: circle },
    });
    map.addLayer({
      id: "radius-fill",
      type: "fill",
      source: "radius-src",
      paint: { "fill-color": "#4a9b8e", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: "radius-line",
      type: "line",
      source: "radius-src",
      paint: {
        "line-color": "#4a9b8e",
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    });
    map.addSource("center-src", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [props.radiusCenter.lng, props.radiusCenter.lat],
        },
      },
    });
    map.addLayer({
      id: "center-point",
      type: "circle",
      source: "center-src",
      paint: {
        "circle-radius": 7,
        "circle-color": "#e9efe9",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#4a9b8e",
      },
    });
  }
  if (props.neighborPairs.length) {
    const lines = {
      type: "FeatureCollection",
      features: props.neighborPairs
        .filter((p) => p.a.lat && p.b.lat)
        .map((pair) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [pair.a.lng, pair.a.lat],
              [pair.b.lng, pair.b.lat],
            ],
          },
        })),
    };
    map.addSource("neighbor-src", { type: "geojson", data: lines });
    map.addLayer({
      id: "neighbor-lines",
      type: "line",
      source: "neighbor-src",
      paint: {
        "line-color": "#d4a546",
        "line-width": 1.5,
        "line-dasharray": [1, 2],
        "line-opacity": 0.7,
      },
    });
  }
}

function makeCirclePolygon(center, radiusKm, points = 64) {
  const coords = [],
    dX = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180)),
    dY = radiusKm / 110.574;
  for (let i = 0; i < points; i++) {
    const t = (i / points) * 2 * Math.PI;
    coords.push([center.lng + dX * Math.cos(t), center.lat + dY * Math.sin(t)]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

// ─── mount ─────────────────────────────────────────────────
onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value,
    style: "mapbox://styles/aseman1005/ckgamsxfo131a1arvafwa8e5n",
    center: [53, 32],
    zoom: 5,
  });
  map.addControl(new mapboxgl.NavigationControl(), "bottom-left");
  map.on("load", () => {
    initDrawnSource();
    map.on("mousemove", (e) => {
      mouse.value.lat = e.lngLat.lat.toFixed(6);
      mouse.value.lng = e.lngLat.lng.toFixed(6);
      const p = utm.fromLatLon(e.lngLat.lat, e.lngLat.lng);
      mouse.value.utm = `Zone ${p.zoneNum}${p.zoneLetter} | E ${p.easting.toFixed(2)} | N ${p.northing.toFixed(2)}`;
      if (activeMode.value === "measure") updateLiveLabel();
    });
    renderMarkers();
    renderRadiusAndLines();
  });
});

onBeforeUnmount(() => {
  clearMarkers();
  clearLabelMarkers();
  if (map) map.remove();
});

watch(() => props.wells, renderMarkers);

// وقتی فقط highlight یا filter عوض شد، فقط data رو آپدیت کن (سریع‌تر از renderMarkers کامل)
function updateHighlightData() {
  if (!map || !map.isStyleLoaded()) return;
  const src = map.getSource("wells-src");
  if (!src) {
    // اگه source نیست (مثلاً marker-based)، کامل render کن
    renderMarkers();
    return;
  }
  const highlightSet = new Set(props.highlightedIds.map(String));
  const data = src._data;
  if (!data || !data.features) {
    renderMarkers();
    return;
  }
  data.features.forEach((f) => {
    const hl = highlightSet.has(String(f.properties.id));
    f.properties._highlighted = hl ? 1 : 0;
    f.properties._dimmed = props.hasFilter && !hl ? 1 : 0;
  });
  src.setData(data);
}

watch(() => props.highlightedIds, updateHighlightData);
watch(() => props.hasFilter, updateHighlightData);
watch(() => [props.radiusCenter, props.radiusKm], renderRadiusAndLines, {
  deep: true,
});
watch(() => props.neighborPairs, renderRadiusAndLines);

// ─── expose ────────────────────────────────────────────────
defineExpose({
  flyTo(lat, lng, zoom = 13) {
    if (map) map.flyTo({ center: [lng, lat], zoom, duration: 800 });
  },
  invalidateSize() {
    if (map) map.resize();
  },
  zoomToFeature(id) {
    if (!map) return;
    const well = props.wells.find((w) => String(w.id) === String(id));
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
  fitToWells(wells) {
    if (!map) return;
    setTimeout(() => {
      const bounds = new mapboxgl.LngLatBounds();
      wells.forEach((w) => {
        if (!w._geometry) {
          if (w.lat && w.lng) bounds.extend([w.lng, w.lat]);
          return;
        }
        const g = w._geometry;
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
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 1000 });
    }, 300);
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
.map-info {
  position: absolute;
  top: 12px;
  inset-inline-start: 12px;
  z-index: 500;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
}

.tool-panel-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}
.tool-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 12px;
  font-family: "Vazirmatn", sans-serif;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  transition: all 0.15s;
}
.tool-toggle-btn:hover {
  border-color: #4a9b8e;
  background: #f0f7f5;
}
.tool-toggle-btn.active {
  background: #4a9b8e;
  color: #fff;
  border-color: #3a8070;
}
.tool-toggle-btn.active svg {
  stroke: #fff;
}

.tool-panel {
  background: rgba(255, 255, 255, 0.97);
  backdrop-filter: blur(8px);
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 8px 6px;
  min-width: 150px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tool-section-label {
  font-size: 10px;
  font-family: "Vazirmatn", sans-serif;
  color: #999;
  padding: 4px 8px 2px;
  text-align: right;
}
.tool-divider {
  height: 1px;
  background: #eee;
  margin: 4px 4px;
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
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
  color: #333;
}
.tool-item:hover {
  background: #f0f7f5;
  color: #2d7a6e;
}
.tool-item.active {
  background: #e8f5f2;
  color: #2d7a6e;
  font-weight: 600;
}
.tool-item.danger {
  color: #c0563f;
}
.tool-item.danger:hover {
  background: #fdf0ee;
}
.tool-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  flex-wrap: wrap;
}
.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #fff;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.1s;
  flex-shrink: 0;
}
.color-dot:hover {
  transform: scale(1.2);
}
.color-custom {
  width: 24px;
  height: 24px;
  border: none;
  cursor: pointer;
  background: none;
  padding: 0;
  border-radius: 4px;
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

  background: #70747aab;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

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

  background: rgba(255, 255, 255, 0.788);
  border: 1px solid rgba(255, 255, 255, 0.18);

  border-radius: 999px;

  backdrop-filter: blur(6px);

  color: #000000;

  font-size: 12px;
  font-family: monospace;
}

.status-chip .label {
  color: #000000;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.status-chip .value {
  color: #000000;
}

.divider {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.25);
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
</style>
