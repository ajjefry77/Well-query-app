<template>
  <div class="map-shell">
    <div ref="mapEl" class="map-el"></div>

    <div class="map-info" v-if="wells.length">
      <span class="mono">{{ wells.length }} عارضه</span>
    </div>

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
      <span>Lat : {{ mouse.lat }}</span>
      <span>Lon : {{ mouse.lng }}</span>
      <span>{{ mouse.utm }}</span>
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

// ─── Draw styles با پشتیبانی از user_color ────────────────
function makeDrawStyles(color) {
  return [
    // پلیگان fill
    {
      id: "gl-draw-polygon-fill",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      paint: {
        "fill-color": ["coalesce", ["get", "user_color"], color],
        "fill-opacity": 0.25,
      },
    },
    // پلیگان border — خط ساده (بدون dasharray)
    {
      id: "gl-draw-polygon-stroke-active",
      type: "line",
      filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "user_color"], color],
        "line-width": 2,
      },
    },
    // خط ساده
    {
      id: "gl-draw-line",
      type: "line",
      filter: ["all", ["==", "$type", "LineString"], ["!=", "mode", "static"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "user_color"], color],
        "line-width": 2.5,
      },
    },
    // نقطه‌های vertex روی خط/پلیگان
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
        "circle-stroke-color": ["coalesce", ["get", "user_color"], color],
        "circle-stroke-width": 2,
      },
    },
    // نقطه مستقل
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
        "circle-color": ["coalesce", ["get", "user_color"], color],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    },
    // static (بعد از تموم شدن رسم)
    {
      id: "gl-draw-polygon-fill-static",
      type: "fill",
      filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
      paint: {
        "fill-color": ["coalesce", ["get", "user_color"], color],
        "fill-opacity": 0.2,
      },
    },
    {
      id: "gl-draw-polygon-stroke-static",
      type: "line",
      filter: ["all", ["==", "$type", "Polygon"], ["==", "mode", "static"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "user_color"], color],
        "line-width": 2,
      },
    },
    {
      id: "gl-draw-line-static",
      type: "line",
      filter: ["all", ["==", "$type", "LineString"], ["==", "mode", "static"]],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["coalesce", ["get", "user_color"], color],
        "line-width": 2.5,
      },
    },
    {
      id: "gl-draw-point-static",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "mode", "static"]],
      paint: {
        "circle-radius": 7,
        "circle-color": ["coalesce", ["get", "user_color"], color],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    },
    // midpoint (نقطه وسط برای اضافه کردن vertex)
    {
      id: "gl-draw-polygon-midpoint",
      type: "circle",
      filter: ["all", ["==", "$type", "Point"], ["==", "meta", "midpoint"]],
      paint: {
        "circle-radius": 4,
        "circle-color": ["coalesce", ["get", "user_color"], color],
        "circle-opacity": 0.6,
      },
    },
  ];
}

// ─── رنگ‌دهی به feature بعد از رسم ──────────────────────
function applyColorToFeature(featureId, color) {
  if (!draw) return;
  draw.setFeatureProperty(featureId, "user_color", color);
  // برای re-render
  const fc = draw.getAll();
  draw.set(fc);
}

// ─── popup رنگ روی شکل ───────────────────────────────────
let colorPopup = null;

function showColorPopup(featureId, lngLat) {
  if (colorPopup) {
    colorPopup.remove();
    colorPopup = null;
  }

  const container = document.createElement("div");
  container.style.cssText =
    "padding:8px;font-family:Vazirmatn,sans-serif;direction:rtl;";

  const title = document.createElement("div");
  title.textContent = "تغییر رنگ";
  title.style.cssText =
    "font-size:12px;font-weight:600;margin-bottom:8px;color:#333;";
  container.appendChild(title);

  const dotsRow = document.createElement("div");
  dotsRow.style.cssText =
    "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";

  presetColors.forEach((c) => {
    const btn = document.createElement("button");
    btn.style.cssText = `width:20px;height:20px;border-radius:50%;background:${c};border:2px solid #fff;
      box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:pointer;`;
    btn.onclick = () => {
      applyColorToFeature(featureId, c);
      colorPopup.remove();
      colorPopup = null;
    };
    dotsRow.appendChild(btn);
  });

  const customInput = document.createElement("input");
  customInput.type = "color";
  customInput.style.cssText =
    "width:24px;height:24px;border:none;cursor:pointer;background:none;padding:0;border-radius:4px;";
  customInput.onchange = (e) => {
    applyColorToFeature(featureId, e.target.value);
    colorPopup.remove();
    colorPopup = null;
  };
  dotsRow.appendChild(customInput);
  container.appendChild(dotsRow);

  colorPopup = new mapboxgl.Popup({ maxWidth: "220px", closeButton: true })
    .setLngLat(lngLat)
    .setDOMContent(container)
    .addTo(map);
}

// ─── label روی شکل ───────────────────────────────────────
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
  draw.getAll().features.forEach((f) => {
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

// ─── مدیریت Draw instance ─────────────────────────────────
function removeDraw() {
  try {
    if (draw && map.hasControl(draw)) map.removeControl(draw);
  } catch {}
}

function activateTool(mode, subTool) {
  if (activeMode.value === mode && drawSubTool.value === subTool) {
    deactivateAll();
    return;
  }
  removeDraw();
  clearLabelMarkers();
  activeMode.value = mode;
  drawSubTool.value = subTool;

  const controls =
    mode === "draw"
      ? {
          point: subTool === "point",
          line_string: subTool === "line",
          polygon: subTool === "polygon",
          trash: true,
        }
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

  // کلیک روی شکل در مود draw → popup رنگ
  if (mode === "draw") {
    map.on("click", onDrawFeatureClick);
  }

  requestAnimationFrame(() => {
    if (subTool === "point") draw.changeMode("draw_point");
    if (subTool === "line") draw.changeMode("draw_line_string");
    if (subTool === "polygon") draw.changeMode("draw_polygon");
  });
}

// رنگ‌دهی خودکار بعد از تموم شدن رسم
function onDrawCreate(e) {
  e.features.forEach((f) => {
    applyColorToFeature(f.id, selectedColor.value);
  });
  const live = document.getElementById("live-measure-label");
  if (live) live.remove();
  updateLabels();

  // دوباره mode رو فعال کن
  requestAnimationFrame(() => {
    if (!draw) return;
    if (drawSubTool.value === "point") draw.changeMode("draw_point");
    if (drawSubTool.value === "line") draw.changeMode("draw_line_string");
    if (drawSubTool.value === "polygon") draw.changeMode("draw_polygon");
  });
}

function onDrawFeatureClick(e) {
  if (!draw) return;
  // چک کن روی feature کلیک شده
  const featuresAtPoint = draw.getFeatureIdsAt(e.point);
  if (!featuresAtPoint.length) return;
  showColorPopup(featuresAtPoint[0], e.lngLat);
}

function deactivateAll() {
  map.off("click", onDrawFeatureClick);
  if (colorPopup) {
    colorPopup.remove();
    colorPopup = null;
  }
  removeDraw();
  clearLabelMarkers();
  const live = document.getElementById("live-measure-label");
  if (live) live.remove();
  activeMode.value = null;
  drawSubTool.value = null;
  map.getCanvas().style.cursor = "";
}

function clearAll() {
  if (draw) draw.deleteAll();
  clearLabelMarkers();
  const live = document.getElementById("live-measure-label");
  if (live) live.remove();
  if (colorPopup) {
    colorPopup.remove();
    colorPopup = null;
  }
}

// ─── رندر عوارض ───────────────────────────────────────────
const COLORS_WELL = [
  "#c97a4a",
  "#4a9b8e",
  "#d4a546",
  "#8b7bb8",
  "#c0563f",
  "#5b9bd5",
  "#7ec88a",
];
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
      f.properties._color = colorForId(f.properties.id);
      f.properties._highlighted = highlightSet.has(String(f.properties.id))
        ? 1
        : 0;
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
        "fill-color": ["get", "_color"],
        "fill-opacity": ["case", ["==", ["get", "_highlighted"], 1], 0.6, 0.3],
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
        "line-color": ["get", "_color"],
        "line-width": ["case", ["==", ["get", "_highlighted"], 1], 3, 2],
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
        "line-color": ["get", "_color"],
        "line-width": ["case", ["==", ["get", "_highlighted"], 1], 4, 2.5],
        "line-opacity": ["case", ["==", ["get", "_highlighted"], 1], 1, 0.8],
      },
    });
    map.addLayer({
      id: "wells-point",
      type: "circle",
      source: "wells-src",
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "_highlighted"], 1], 9, 6],
        "circle-color": ["get", "_color"],
        "circle-stroke-width": 2,
        "circle-stroke-color": [
          "case",
          ["==", ["get", "_highlighted"], 1],
          "#1a1a1a",
          "#ffffff",
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
      const isH = highlightSet.has(String(w.id)),
        color = colorForId(w.id),
        size = isH ? 18 : 12;
      const el = document.createElement("div");
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:${color};
        border:${isH ? "3px solid #1a1a1a" : "2px solid #fff"};box-shadow:0 2px 6px rgba(0,0,0,0.5);cursor:pointer;
        ${isH ? "outline:3px solid rgba(74,155,142,0.4);outline-offset:2px;" : ""}`;
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

// ─── mount ────────────────────────────────────────────────
onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value,
    style: "mapbox://styles/mapbox/light-v11",
    center: [53, 32],
    zoom: 5,
  });
  map.addControl(new mapboxgl.NavigationControl(), "bottom-left");
  map.on("load", () => {
    map.on("draw.create", onDrawCreate);
    map.on("draw.update", updateLabels);
    map.on("draw.delete", () => {
      clearLabelMarkers();
    });
    map.on("draw.render", () => {
      if (activeMode.value === "measure") updateLiveLabel();
    });
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
watch(() => props.highlightedIds, renderMarkers);
watch(() => [props.radiusCenter, props.radiusKm], renderRadiusAndLines, {
  deep: true,
});
watch(() => props.neighborPairs, renderRadiusAndLines);


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

/* color picker */
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
  height: 34px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.92);
  border-top: 1px solid #ddd;
  font-size: 12px;
  font-family: monospace;
  z-index: 999;
}
</style>
