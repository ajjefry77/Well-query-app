<template>
  <div class="map-shell">
    <div ref="mapEl" class="map-el"></div>

    <!-- نوار ابزارهای کنار نقشه (ثابت، بدون دراپ‌داون؛ آیکون + hint) -->
    <div class="map-tools" role="toolbar" aria-label="ابزارهای نقشه">
      <!-- ابزار اطلاعات: جدا و بالاتر از همه ابزارها -->
      <div class="map-tools__group">
        <button
          class="map-tool"
          :class="{ active: selectionTool === 'info' }"
          data-tool="info"
          title="اطلاعات"
          @click="toggleSelectionTool('info')"
        >i</button>
      </div>

      <div class="map-tools__sep"></div>

      <!-- گروه انتخاب -->
      <div class="map-tools__group">
        <button
          v-for="t in SELECT_TOOLS"
          :key="t.id"
          class="map-tool"
          :class="{ active: selectionTool === t.id }"
          :data-tool="t.id"
          :title="t.hint"
          @click="toggleSelectionTool(t.id)"
        >{{ t.icon }}</button>
        <button
          class="map-tool"
          :disabled="!selectionCount"
          :title="`زوم به انتخاب (${selectionCount.toLocaleString('fa-IR')})`"
          @click="$emit('zoom-to-selection')"
        ><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></svg></button>
        <button class="map-tool" :disabled="!selectionCount" title="ذخیره انتخاب‌ها (Shapefile)" @click="$emit('save-selection')"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg></button>
        <button
          class="map-tool danger"
          :disabled="!selectionCount"
          :title="`پاک کردن انتخاب (${selectionCount.toLocaleString('fa-IR')})`"
          @click="$emit('selection-clear')"
        ><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-dasharray="3 2" d="M3 3h14v14H3z"/><path d="m15 15 6 6m0-6-6 6"/></svg></button>
      </div>

      <div class="map-tools__sep"></div>

      <!-- گروه ترسیم -->
      <div class="map-tools__group">
        <label class="map-tool map-tool--color" title="رنگ ترسیم">
          <input type="color" v-model="selectedColor" />
          <span class="map-tool__color-dot" :style="{ background: selectedColor }"></span>
        </label>
        <button
          class="map-tool"
          :class="{ active: activeMode === 'draw' && drawSubTool === 'point' }"
          title="نقطه"
          @click="activateTool('draw', 'point')"
        >●</button>
        <button
          class="map-tool"
          :class="{ active: activeMode === 'draw' && drawSubTool === 'line' }"
          title="خط"
          @click="activateTool('draw', 'line')"
        >╱</button>
        <button
          class="map-tool"
          :class="{ active: activeMode === 'draw' && drawSubTool === 'polygon' }"
          title="پلیگان"
          @click="activateTool('draw', 'polygon')"
        >⬡</button>
        <button
          class="map-tool danger"
          title="حذف ترسیم‌ها"
          @click="clearAll"
        ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div>

      <div class="map-tools__sep"></div>

      <!-- گروه اندازه‌گیری -->
      <div class="map-tools__group">
        <button
          class="map-tool"
          :class="{ active: activeMode === 'measure' && drawSubTool === 'line' }"
          title="طول"
          @click="activateTool('measure', 'line')"
        >↔</button>
        <button
          class="map-tool"
          :class="{ active: activeMode === 'measure' && drawSubTool === 'polygon' }"
          title="مساحت"
          @click="activateTool('measure', 'polygon')"
        >⊡</button>
        <button
          class="map-tool danger"
          title="حذف اندازه‌ها"
          @click="clearAll"
        ><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
      </div>

      <span
        v-if="selectionCount > 0"
        class="map-tools__badge"
        :title="`${selectionCount.toLocaleString('fa-IR')} عارضه انتخاب شده`"
      >{{ selectionCount.toLocaleString('fa-IR') }}</span>
    </div>

    <!-- نوار شناور ابزار فعال -->
    <Transition name="tool-chip">
      <div v-if="activeToolChip" class="active-tool-chip" role="status">
        <span class="active-tool-chip__pulse"></span>
        <span class="active-tool-chip__text">{{ activeToolChip }}</span>
        <button
          class="active-tool-chip__close"
          title="غیرفعال کردن ابزار (Esc)"
          @click="deactivateAllTools()"
        >✕</button>
      </div>
    </Transition>

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
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { resolveFeatureStyle, rampStops, defaultSymbology, DEFAULT_FEATURE_COLOR } from "../composables/useSymbology.js";
import booleanIntersects from "@turf/boolean-intersects";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointToLineDistance from "@turf/point-to-line-distance";
import turfCircle from "@turf/circle";
import turfBuffer from "@turf/buffer";

// ─── ابزارهای انتخاب عارضه (نقطه‌ای: کلیک اول + حرکت موس + کلیک دوم، بدون نیاز به درگ) ───
const SELECT_TOOLS = [
  { id: "rectangle", label: "مستطیل", icon: "▭", hint: "مستطیل" },
  { id: "circle", label: "دایره", icon: "○", hint: "دایره" },
  { id: "point", label: "دستی", icon: "●", hint: "دستی" },
];
// هایلایت مجموعه انتخاب — دقیقاً هم‌رنگ انتخاب با کلیک عادی (زرد)
const SEL_COLOR = "#f0a500";
const SEL_BORDER = "#1a1a1a";
// هایلایت آبی پر رنگ برای ابزار «اطلاعات»
const INFO_COLOR = "#2563eb";
const INFO_BORDER = "#1e3a8a";

// راهنمای متنی هر ابزار انتخاب (نوار شناور ابزار فعال)
const SELECT_INSTRUCTIONS = {
  rectangle: "کلیک اول، حرکت موس، کلیک دوم",
  circle: "کلیک اول مرکز، حرکت موس، کلیک دوم",
  point: "روی عارضه کلیک کنید",
  info: "روی عارضه کلیک کنید",
};

// ─── سیمبولوژی (ArcGIS-style): استایل پایه هر عارضه از کانفیگ لایه‌اش ───
function geomKindOf(w) {
  const g = w?._geometry ?? w?.geometry
  const t = g?.type
  if (t === 'LineString' || t === 'MultiLineString') return 'line'
  if (t === 'Polygon' || t === 'MultiPolygon') return 'polygon'
  return 'point'
}
function symStyleOf(w) {
  try {
    const cfg = props.symConfigs?.[w?._layerUuid] ?? defaultSymbology(w?._layerUuid, geomKindOf(w))
    if (!cfg || cfg.renderer === 'heatmap') return null
    return resolveFeatureStyle(w, cfg, geomKindOf(w))
  } catch { return null }
}
function heatConfigs() {
  const out = []
  const cfgs = props.symConfigs || {}
  for (const uuid of Object.keys(cfgs)) {
    if (cfgs[uuid]?.renderer === 'heatmap') out.push({ uuid, heat: cfgs[uuid].heat || {} })
  }
  return out
}
function dotConfigs() {
  const out = []
  const cfgs = props.symConfigs || {}
  for (const uuid of Object.keys(cfgs)) {
    if (cfgs[uuid]?.renderer === 'dot') out.push({ uuid, dot: cfgs[uuid].dot || {}, field: cfgs[uuid].field })
  }
  return out
}
// تست نقطه‌در‌پلیگان (ray casting) برای تولید دات‌دنسیتی
function pip(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function polyRings(w) {
  const g = w?._geometry
  if (!g) return []
  if (g.type === 'Polygon') return [g.coordinates[0]]
  if (g.type === 'MultiPolygon') return g.coordinates.map(p => p[0])
  return []
}
function buildDotGeoJSON() {
  const feats = []
  for (const d of dotConfigs()) {
    const per = Math.max(0.001, Number(d.dot.value) || 1)
    const rows = props.wells.filter(w => String(w._layerUuid) === String(d.uuid))
    let budget = 4000
    for (const w of rows) {
      if (budget <= 0) break
      const rings = polyRings(w)
      if (!rings.length) continue
      let n = 1
      if (d.field) {
        const v = Number(w[d.field])
        n = Number.isFinite(v) ? Math.max(0, Math.round(v / per)) : 0
      }
      n = Math.min(250, n, budget)
      if (n <= 0) continue
      budget -= n
      // bbox بزرگ‌ترین رینگ
      let big = rings[0], bigA = -1
      for (const r of rings) {
        let a = 0
        for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i+1][1] - r[i+1][0] * r[i][1]
        a = Math.abs(a / 2)
        if (a > bigA) { bigA = a; big = r }
      }
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const c of big) {
        if (c[0] < minX) minX = c[0]
        if (c[0] > maxX) maxX = c[0]
        if (c[1] < minY) minY = c[1]
        if (c[1] > maxY) maxY = c[1]
      }
      let placed = 0, tries = 0
      while (placed < n && tries < n * 12 + 20) {
        tries++
        const x = minX + Math.random() * (maxX - minX)
        const y = minY + Math.random() * (maxY - minY)
        if (!pip(x, y, big)) continue
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { _dotLayer: d.uuid } })
        placed++
      }
    }
  }
  return { type: 'FeatureCollection', features: feats }
}
let dotCache = { sig: '', geo: null };
function dotGeoCached() {
  const dots = dotConfigs();
  const sig = `${props.wellsKey}|${dots.map(d => `${d.uuid}:${d.field}:${d.dot.value}`).join(',')}`;
  if (dotCache.sig === sig && dotCache.geo) return dotCache.geo;
  const geo = buildDotGeoJSON();
  dotCache = { sig, geo };
  return geo;
}
function heatColorExpr(rampId) {
  const stops = rampStops(rampId || 'turbo')
  const n = stops.length
  const expr = ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)']
  for (let i = 0; i < n; i++) {
    expr.push((i + 1) / (n + 1))
    expr.push(stops[i])
  }
  return expr
}
const SYM_HEAT_PREFIX = 'sym-heat-'
const SYM_DOT_SRC = 'sym-dot-src'
const SYM_DOT_LAYER = 'sym-dot-layer'
// ─── لایه‌های عارضه (شکل نقطه + سبک خط per-layer) ───
// line-dasharray در Mapbox داده‌محور نیست؛ پس برای هر سبک خط یک لایه جدا با فیلتر
// روی _sym_dash می‌سازیم. شکل‌های نقطه‌ای غیر‌دایره هم با لایه symbol رندر می‌شوند.
const POINT_SHAPES = [
  { id: 'square', char: '■' },
  { id: 'triangle', char: '▲' },
  { id: 'diamond', char: '◆' },
  { id: 'cross', char: '✕' },
  { id: 'star', char: '★' },
]
const WELL_LAYER_IDS = [
  'wells-fill',
  'wells-line', 'wells-line-dash', 'wells-line-dot',
  'wells-polyline', 'wells-polyline-dash', 'wells-polyline-dot',
  'wells-point',
  ...POINT_SHAPES.map(s => 'wells-pt-' + s.id),
]
function clearSymLayers() {
  if (!map) return
  try {
    for (const d of heatConfigs()) {
      const lid = SYM_HEAT_PREFIX + String(d.uuid).slice(0, 8)
      if (map.getLayer(lid)) map.removeLayer(lid)
      if (map.getSource(lid)) map.removeSource(lid)
    }
    // لایه‌های قدیمی جا‌مانده از لایه حذف‌شده
    for (const lid of [...(map.getStyle()?.layers ?? [])].map(l => l.id)) {
      if (lid.startsWith(SYM_HEAT_PREFIX) && !heatConfigs().some(d => SYM_HEAT_PREFIX + String(d.uuid).slice(0, 8) === lid)) {
        try { map.removeLayer(lid) } catch {}
        try { map.removeSource(lid) } catch {}
      }
    }
    if (map.getLayer(SYM_DOT_LAYER)) map.removeLayer(SYM_DOT_LAYER)
    if (map.getSource(SYM_DOT_SRC)) map.removeSource(SYM_DOT_SRC)
  } catch {}
}
function refreshSymLayers() {
  if (!map || !map.isStyleLoaded()) return
  clearSymLayers()
  try {
    // ── هیت‌مپ: یک لایه heatmap به‌ازای هر لایه نقطه‌ای با رندر heatmap ──
    for (const d of heatConfigs()) {
      const lid = SYM_HEAT_PREFIX + String(d.uuid).slice(0, 8)
      const pts = []
      for (const w of props.wells) {
        if (String(w._layerUuid) !== String(d.uuid)) continue
        const g = w._geometry
        if (g?.type === 'Point' && Array.isArray(g.coordinates)) pts.push({ type: 'Feature', geometry: g, properties: {} })
        else if (Number.isFinite(+w.lat) && Number.isFinite(+w.lng)) pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [+w.lng, +w.lat] }, properties: {} })
      }
      map.addSource(lid, { type: 'geojson', data: { type: 'FeatureCollection', features: pts } })
      map.addLayer({
        id: lid, type: 'heatmap', source: lid,
        paint: {
          'heatmap-radius': d.heat.radius ?? 30,
          'heatmap-intensity': d.heat.intensity ?? 0.6,
          'heatmap-opacity': d.heat.opacity ?? 0.85,
          'heatmap-color': heatColorExpr(d.heat.ramp),
        },
      })
    }
    // ── دات‌دنسیتی: یک لایه circle روی نقاط تولیدشده ──
    const dots = dotConfigs()
    if (dots.length) {
      const geo = dotGeoCached()
      const first = dots[0]
      map.addSource(SYM_DOT_SRC, { type: 'geojson', data: geo })
      map.addLayer({
        id: SYM_DOT_LAYER, type: 'circle', source: SYM_DOT_SRC,
        paint: {
          'circle-radius': first.dot.size ?? 2.5,
          'circle-color': first.dot.color ?? '#1a1a1a',
          'circle-opacity': first.dot.opacity ?? 0.85,
          'circle-stroke-width': 0,
        },
      })
    }
  } catch {}
}

// ─── لود تنبل mapbox/draw: ایمپورت استاتیک حذف شد تا باندل اولیه ~۱MB سبک‌تر شود ───
// mapbox-gl فقط وقتی این کامپوننت (async) باز شود دانلود می‌شود، نه در لود اول صفحه.
let mapboxgl = null;
let MapboxDraw = null;
let utmMod = null;
function ensureMapCss(href) {
  try {
    if (document.querySelector(`link[data-wqa="${href}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.wqa = href;
    document.head.appendChild(l);
  } catch {}
}

// ─── جایگزین سبک @turf/turf (حذف ~۶۰۰KB): هاورساین + مساحت پلانار ───
const _R = 6371;
const _rad = (d) => (d * Math.PI) / 180;
function _hav(a, b, c, d) {
  const dLa = _rad(c - a), dLn = _rad(d - b);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(_rad(a)) * Math.cos(_rad(c)) * Math.sin(dLn / 2) ** 2;
  return 2 * _R * Math.asin(Math.min(1, Math.sqrt(s)));
}
function lineLengthKm(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += _hav(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
  return s;
}
function ringAreaM2(ring) {
  if (!ring?.length) return 0;
  const avgLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const kx = 111320 * Math.cos(_rad(avgLat)), ky = 110540;
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) a += (ring[i][0]*kx) * (ring[i+1][1]*ky) - (ring[i+1][0]*kx) * (ring[i][1]*ky);
  return Math.abs(a / 2);
}
function turfLengthLite(f) {
  const g = f.geometry ?? f;
  if (g.type === "LineString") return lineLengthKm(g.coordinates);
  return 0;
}
function turfAreaLite(f) {
  const g = f.geometry ?? f;
  if (g.type === "Polygon") return ringAreaM2(g.coordinates[0]);
  if (g.type === "MultiPolygon") return g.coordinates.reduce((s, p) => s + ringAreaM2(p[0]), 0);
  return 0;
}

const props = defineProps({
  wells: { type: Array, required: true },
  wellsKey: { type: String, default: '' },
  highlightedIds: { type: Array, default: () => [] },
  hasFilter: { type: Boolean, default: false },
  filteredLayerUuids: { type: Array, default: () => [] },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, default: 0 },
  selectedId: { type: [String, Number], default: null },
  // عارضه‌ای که ابزار «اطلاعات» روی آن کلیک کرده → آبی پر رنگ + پاپ‌آپ مشخصات
  infoWellKey: { type: String, default: null },
  // کانفیگ سیمبولوژی هر لایه (uuid -> config) — استایل per-feature داخل همین کامپوننت ساخته می‌شود
  symConfigs: { type: Object, default: () => ({}) },
  symVersion: { type: Number, default: 0 },
  // هایلایت فوری عارضه‌های مبدأ/هدف رابطه مکانی (قبل از Apply)
  previewIds: { type: Array, default: () => [] },
  // تفکیک رنگی: مبدأ زرد، هدف سبز (رابطه برقرار) / قرمز (برقرار نیست)
  previewSourceIds: { type: Array, default: () => [] },
  previewOkIds: { type: Array, default: () => [] },
  previewFailIds: { type: Array, default: () => [] },
  theme: { type: String, default: "light" },
  // ── انتخاب عارضه (state در والد نگه‌داری می‌شود تا پنل کوئری هم استفاده کند) ──
  selectionTool: { type: String, default: null },
  selectionMode: { type: String, default: "new" },
  selectionIds: { type: Array, default: () => [] },
  selectionCount: { type: Number, default: 0 },
});
const emit = defineEmits(["select-well", "map-empty-click", "update:selection-tool", "update:selection-mode", "selection-change", "selection-clear", "zoom-to-selection", "save-selection", "info-select", "update:info-well-key"]);

const mapEl = ref(null);
const activeMode = ref(null);
const drawSubTool = ref(null);

const selectedColor = ref("#3498db");

let map = null;
let draw = null;
let markers = [];
let labelMarkers = [];
let wellsGeoJSON = null;

// ─── حالت انتخاب هوشمند نقطه مرکزی ───
// فضای خالی → نقطه دلخواه، کلیک روی عارضه → همان عارضه
let picking = false;
let pickerCb = null;

// ─── موتور انتخاب عارضه (نقطه‌ای، بدون درگ) ───
// مستطیل/دایره: کلیک اول = لنگر، حرکت موس = پیش‌نمایش اندازه، کلیک دوم = ثبت
let selecting = false;          // ابزار انتخاب فعال است؟
let selAnchor = null;           // لنگر جاری { type, startX, startY, startLngLat, el }

function toggleSelectionTool(id) {
  emit("update:selection-tool", props.selectionTool === id ? null : id);
}

// وضعیت لنگر برای نمایش راهنمای «کلیک دوم» در نوار شناور
const selAnchorActive = ref(false);
// متن نوار شناور ابزار فعال (تا کاربر همیشه بداند چه ابزاری فعال است و چه کند)
const activeToolChip = computed(() => {
  if (props.selectionTool) {
    if (props.selectionTool === "info") return "اطلاعات: روی عارضه کلیک کنید";
    const t = SELECT_TOOLS.find((x) => x.id === props.selectionTool);
    if (selAnchorActive.value && (props.selectionTool === "rectangle" || props.selectionTool === "circle"))
      return `${t?.label ?? props.selectionTool}: کلیک دوم = ثبت`;
    return `${t?.label ?? props.selectionTool}`;
  }
  if (activeMode.value === "draw") {
    const sub = drawSubTool.value === "point" ? "نقطه" : drawSubTool.value === "line" ? "خط" : "پلیگان";
    return `ترسیم ${sub}`;
  }
  if (activeMode.value === "measure") {
    return drawSubTool.value === "line" ? "طول" : "مساحت";
  }
  return "";
});

// غیرفعال‌سازی همه ابزارها (دکمه ✕ نوار شناور)
function deactivateAllTools() {
  clearSelAnchor();
  cancelSelDrag();
  if (props.selectionTool) emit("update:selection-tool", null);
  if (activeMode.value) deactivateAll();
}

// ─── وضعیت سراسری کلیدهای اصلاح‌کننده (Shift/Ctrl/Alt) ───
// مرورگر گاهی altKey/shiftKey را در originalEvent کلیک گم می‌کند (و Alt منو را می‌دزدد)؛
// برای همین وضعیت کلیدها هم از رویداد موس و هم از شنونده صفحه خوانده و OR می‌شود.
const modHeld = { shift: false, ctrl: false, meta: false, alt: false };
function syncModsFromDomEvent(domEv) {
  try {
    if (!domEv) return;
    if (typeof domEv.shiftKey === "boolean") modHeld.shift = !!domEv.shiftKey;
    if (typeof domEv.ctrlKey === "boolean") modHeld.ctrl = !!domEv.ctrlKey;
    if (typeof domEv.metaKey === "boolean") modHeld.meta = !!domEv.metaKey;
    if (typeof domEv.altKey === "boolean") modHeld.alt = !!domEv.altKey;
  } catch {}
}
// خروجی یکدست {shift,ctrl,alt} از روی ایونت mapbox/DOM + وضعیت سراسری صفحه
function domMods(e) {
  try {
    const oe = e?.originalEvent ?? e;
    syncModsFromDomEvent(oe);
    return {
      shift: !!(oe?.shiftKey || modHeld.shift),
      ctrl: !!(oe?.ctrlKey || oe?.metaKey || modHeld.ctrl || modHeld.meta),
      alt: !!(oe?.altKey || modHeld.alt),
    };
  } catch {
    return { shift: !!modHeld.shift, ctrl: !!(modHeld.ctrl || modHeld.meta), alt: !!modHeld.alt };
  }
}
// سرکوب کلیکِ دنباله‌دار بعد از درگ/مارکر تا یک ژست فقط یک‌بار ثبت شود
let selSuppressClickUntil = 0;
function suppressSelClick(ms = 600) {
  selSuppressClickUntil = Date.now() + ms;
}
function isSelClickSuppressed() {
  return Date.now() < selSuppressClickUntil;
}

function resolveSelMode(e) {
  const m = domMods(e);
  if (m.shift) return "add";
  // Ctrl (و Meta در مک) = حذف از انتخاب؛ چرخش نقشه غیرفعال شده تا Ctrl آزاد باشد
  if (m.ctrl) return "remove";
  return "new";
}

// Alt = فقط عوارضی که کاملاً داخل محدوده‌اند انتخاب شوند
function isContainedOnly(e) {
  return domMods(e).alt;
}

function applySelection(geom, kind, mode, containedOnly = false) {
  const keys = selectKeysInGeom(geom, kind, containedOnly);
  emit("selection-change", keys, mode || "new");
}

// bbox سریع یک هندسه برای پیش‌فیلتر
function geomBbox(g) {
  if (!g || !g.coordinates) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };
  const walk = (c) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number") eat(+c[0], +c[1]);
    else c.forEach(walk);
  };
  try { walk(g.coordinates); } catch { return null; }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}
function bboxDisjoint(a, b) {
  return !a || !b || a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1];
}
function wellGeomOf(w) {
  if (w?._geometry) return w._geometry;
  if (Number.isFinite(+w?.lat) && Number.isFinite(+w?.lng))
    return { type: "Point", coordinates: [+w.lng, +w.lat] };
  return null;
}

// Alt: آیا «کل» عارضه داخل محدوده است؟
// تک‌تک رأس‌های عارضه باید داخل پلیگان انتخاب باشند (نه فقط بخشی از آن).
// این روش نسبت به booleanWithin روی هندسه‌های واقعی داده (Multi، حفره، دقت اعشار) قابل‌اعتمادتر است.
function allCoordsWithin(wg, shapeGeom) {
  try {
    let count = 0;
    let ok = true;
    const walk = (c) => {
      if (!ok || !Array.isArray(c)) return;
      if (typeof c[0] === "number") {
        const x = +c[0], y = +c[1];
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        count++;
        if (booleanPointInPolygon([x, y], shapeGeom) !== true) ok = false;
        return;
      }
      for (let i = 0; i < c.length && ok; i++) walk(c[i]);
    };
    walk(wg?.coordinates);
    return ok && count > 0;
  } catch { return false; }
}

// محاسبه کلیدهای عوارض داخل/متقاطع با هندسه انتخاب
// containedOnly (کلید Alt): فقط عوارضی که کاملاً داخل محدوده‌اند
function selectKeysInGeom(geom, kind, containedOnly = false) {
  const out = [];
  if (!geom) return out;
  const wells = props.wells || [];
  const shapeBbox = kind === "line" ? null : geomBbox(geom.type === "Feature" ? geom.geometry : geom);
  const shapeGeom = geom.type === "Feature" ? geom.geometry : geom;
  let lineFeature = null, lineTolKm = 0;
  if (kind === "line") {
    try {
      const z = map ? map.getZoom() : 10;
      const lat = shapeGeom.coordinates?.[0]?.[1] ?? 32;
      const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
      lineTolKm = Math.max(0.05, (mpp * 12) / 1000);
      lineFeature = { type: "Feature", geometry: shapeGeom, properties: {} };
    } catch { lineFeature = { type: "Feature", geometry: shapeGeom, properties: {} }; lineTolKm = 0.3; }
  }
  for (let i = 0; i < wells.length; i++) {
    const w = wells[i];
    const wg = wellGeomOf(w);
    if (!wg) continue;
    // پیش‌فیلتر bbox (به‌جز خط که بافر تلرانس دارد)
    if (kind !== "line" && shapeBbox) {
      const wb = wg.type === "Point" ? [wg.coordinates[0], wg.coordinates[1], wg.coordinates[0], wg.coordinates[1]] : geomBbox(wg);
      if (bboxDisjoint(shapeBbox, wb)) continue;
    }
    let hit = false;
    try {
      if (kind === "line") {
        if (wg.type === "Point") {
          const d = pointToLineDistance(
            { type: "Feature", geometry: wg, properties: {} },
            lineFeature,
            { units: "kilometers" },
          );
          hit = Number.isFinite(d) && d <= lineTolKm;
        } else {
          const buf = turfBuffer(lineFeature, lineTolKm, { units: "kilometers" });
          const bg = buf?.type === "Feature" ? buf.geometry : buf;
          if (bg) hit = booleanIntersects({ type: "Feature", geometry: wg, properties: {} }, { type: "Feature", geometry: bg, properties: {} });
        }
      } else if (containedOnly) {
        // Alt: کل عارضه (همه رأس‌ها) باید داخل محدوده باشد؛ نقطه هم همین مسیر را می‌رود
        hit = allCoordsWithin(wg, shapeGeom);
      } else if (wg.type === "Point") {
        hit = booleanPointInPolygon(wg.coordinates, shapeGeom) === true;
      } else {
        hit = booleanIntersects({ type: "Feature", geometry: wg, properties: {} }, { type: "Feature", geometry: shapeGeom, properties: {} });
      }
    } catch { hit = false; }
    if (hit) {
      const k = wellKey(w);
      if (k) out.push(String(k));
    }
  }
  return out;
}

// غیرفعال‌سازی چرخش/زاویه نقشه تا Ctrl آزاد شود (Ctrl = حذف از انتخاب)
function disableMapRotation() {
  if (!map) return;
  try { map.dragRotate?.disable(); } catch {}
  try { map.touchPitch?.disable(); } catch {}
  try { map.touchZoomRotate?.disableRotation(); } catch {}
  try { if (map.dragRotate && map.dragRotate._pitchWithRotate !== undefined) map.dragRotate._pitchWithRotate = false; } catch {}
}

// فعال/غیرفعال‌سازی ابزار انتخاب (مستطیل/دایره/دستی)
function setSelectionToolActive(tool) {
  selecting = !!tool;
  // تعویض ابزار یا غیرفعال‌سازی → ژست نیمه‌کاره پاک شود
  if (selDrag && (!tool || selDrag.type !== tool)) cancelSelDrag();
  if (!tool || (selAnchor && selAnchor.type !== tool)) clearSelAnchor();
  // تعارض با ترسیم/اندازه‌گیری و پیکر نقطه: فقط یکی فعال باشد
  if (tool && draw && map?.hasControl?.(draw)) removeDraw();
  if (tool) {
    activeMode.value = null;
    drawSubTool.value = null;
    if (picking && map) {
      try { map.off("click", map._pickerHandler); } catch {}
      picking = false; pickerCb = null;
      map.getCanvas().style.cursor = "";
    }
  }
  if (!map) return;
  try {
    disableMapRotation();
    // ابزار «دستی»: درگ کردن بی‌اثر است (نه انتخاب، نه پن نقشه)
    if (tool === "point") {
      try { map.dragPan.disable(); } catch {}
    } else {
      try { map.dragPan.enable(); } catch {}
    }
    if (tool) {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = tool === "info" ? "pointer" : "crosshair";
    } else {
      map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = "";
    }
  } catch {}
}

function onSelKeyDown(e) {
  try {
    if (e.key === "Shift") modHeld.shift = true;
    else if (e.key === "Control") modHeld.ctrl = true;
    else if (e.key === "Meta") modHeld.meta = true;
    else if (e.key === "Alt") { modHeld.alt = true; e.preventDefault(); }
  } catch {}
  if (!selecting) return;
  if (e.key === "Escape") {
    // اول ژست نیمه‌کاره لغو شود، بعد ابزار بسته شود
    if (selDrag) { cancelSelDrag(); return; }
    if (selAnchor) { clearSelAnchor(); return; }
    emit("update:selection-tool", null);
  }
}
function onSelKeyUp(e) {
  try {
    if (e.key === "Shift") modHeld.shift = false;
    else if (e.key === "Control") modHeld.ctrl = false;
    else if (e.key === "Meta") modHeld.meta = false;
    else if (e.key === "Alt") modHeld.alt = false;
  } catch {}
}
function onSelBlur() {
  modHeld.shift = false; modHeld.ctrl = false; modHeld.meta = false; modHeld.alt = false;
}

// حلقه مستطیل پیکسلی به مختصات جغرافیایی
function boxRing(x0, y0, x1, y1) {
  const a = map.unproject([Math.min(x0, x1), Math.min(y0, y1)]);
  const b = map.unproject([Math.max(x0, x1), Math.max(y0, y1)]);
  return [[a.lng, b.lat], [b.lng, b.lat], [b.lng, a.lat], [a.lng, a.lat], [a.lng, b.lat]];
}
// انتخاب نقطه‌ای در یک پیکسل (کلیک ساده با هر ابزار)
function selectAtPixel(px, py, mode, containedOnly = false, tolPx = 6) {
  if (!map) return;
  applySelection(
    { type: "Polygon", coordinates: [boxRing(px - tolPx, py - tolPx, px + tolPx, py + tolPx)] },
    "rectangle",
    mode || "new",
    containedOnly,
  );
}

// ─── انتخاب مستطیل/دایره: کلیک-کلیک (پیش‌فرض) + درگ با Shift/Ctrl/Alt ───
// درگ ساده = جابه‌جایی نقشه؛ درگ همراه با کلید اصلاح‌کننده = انتخاب با همان کلید.
function clearSelAnchor() {
  try { selAnchor?.el?.remove(); } catch {}
  selAnchor = null;
  selAnchorActive.value = false;
}
function containerXY(clientX, clientY) {
  try {
    const r = map.getContainer().getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  } catch { return [0, 0]; }
}
// نقاشی مشترک پیش‌نمایش (لنگر و درگ)
function paintSelPreview(a, x, y) {
  const el = a?.el;
  if (!el) return;
  if (a.type === "rectangle") {
    const x0 = Math.min(a.startX, x), y0 = Math.min(a.startY, y);
    el.style.left = x0 + "px"; el.style.top = y0 + "px";
    el.style.width = Math.max(1, Math.abs(x - a.startX)) + "px";
    el.style.height = Math.max(1, Math.abs(y - a.startY)) + "px";
  } else {
    const ddx = x - a.startX, ddy = y - a.startY;
    const r = Math.sqrt(ddx * ddx + ddy * ddy);
    el.style.left = a.startX - r + "px"; el.style.top = a.startY - r + "px";
    el.style.width = Math.max(1, r * 2) + "px"; el.style.height = Math.max(1, r * 2) + "px";
  }
}
function makeSelPreviewEl(type, px, py) {
  const container = map.getContainer();
  const el = document.createElement("div");
  el.className = "sel-drag-box";
  if (type === "circle") el.classList.add("is-circle");
  el.style.left = px + "px";
  el.style.top = py + "px";
  el.style.width = "1px";
  el.style.height = "1px";
  container.appendChild(el);
  return el;
}
// ثبت نهایی مشترک (لنگر و درگ): بدون حرکت = نقطه‌ای
function finalizeSelShape(type, startX, startY, startLngLat, endX, endY, mode, onlyInside) {
  const moved = Math.abs(endX - startX) + Math.abs(endY - startY);
  if (moved < 5) {
    selectAtPixel(endX, endY, mode, onlyInside);
    return;
  }
  if (type === "rectangle") {
    applySelection({ type: "Polygon", coordinates: [boxRing(startX, startY, endX, endY)] }, "rectangle", mode, onlyInside);
  } else {
    try {
      const edge = map.unproject([endX, endY]);
      const c = startLngLat || map.unproject([startX, startY]);
      const rKm = _hav(c.lat, c.lng, edge.lat, edge.lng);
      if (rKm > 0.0001) {
        const circ = turfCircle([c.lng, c.lat], rKm, { steps: 64, units: "kilometers" });
        applySelection(circ.geometry || circ, "circle", mode, onlyInside);
      }
    } catch {}
  }
}
// ترکیب کلیدها از شروع و پایان ژست (کافی است در یکی از دو لحظه نگه داشته شده باشند)
function mergeSelMods(a, b) {
  return {
    shift: !!(a?.shift || b?.shift),
    ctrl: !!(a?.ctrl || b?.ctrl),
    alt: !!(a?.alt || b?.alt),
  };
}
function modeOfMods(m) {
  if (m.shift) return "add";
  if (m.ctrl) return "remove";
  return "new";
}
// پیش‌نمایش زنده با حرکت موس (بدون نگه‌داشتن دکمه)
function onSelMouseMove(e) {
  try { syncModsFromDomEvent(e); } catch {}
  if (!selecting || !map) return;
  if (selDrag) {
    try {
      const [x, y] = containerXY(e.clientX, e.clientY);
      paintSelPreview(selDrag, x, y);
    } catch {}
    return;
  }
  if (!selAnchor) return;
  let x, y;
  try {
    if (typeof e.clientX === "number") [x, y] = containerXY(e.clientX, e.clientY);
    else if (e.point) { x = e.point.x; y = e.point.y; }
    else return;
  } catch { return; }
  paintSelPreview(selAnchor, x, y);
}
// درگ با کلید اصلاح‌کننده: Shift=افزودن، Ctrl=حذف، Alt=فقط کاملاً داخل
// (فقط مستطیل/دایره؛ ابزار دستی درگ ندارد و درگ = پن نقشه)
let selDrag = null; // { type, startX, startY, startLngLat, el, mods }
function onSelMouseDown(e) {
  if (!selecting || !map) return;
  const tool = props.selectionTool;
  if (tool !== "rectangle" && tool !== "circle") return;
  if (e.button !== 0) return;
  const m = domMods(e);
  if (!m.shift && !m.ctrl && !m.alt) return; // درگ/کلیک ساده = پن نقشه
  if (selDrag || selAnchor) return;
  try { map.dragPan.disable(); } catch {}
  const [sx, sy] = containerXY(e.clientX, e.clientY);
  let startLngLat = null;
  try { startLngLat = map.unproject([sx, sy]); } catch {}
  selDrag = { type: tool, startX: sx, startY: sy, startLngLat, el: makeSelPreviewEl(tool, sx, sy), mods: m };
  window.addEventListener("mousemove", onSelDragMove);
  window.addEventListener("mouseup", onSelDragUp);
}
function onSelDragMove(ev) {
  if (!selDrag) return;
  try {
    syncModsFromDomEvent(ev);
    const [x, y] = containerXY(ev.clientX, ev.clientY);
    paintSelPreview(selDrag, x, y);
  } catch {}
}
function onSelDragUp(ev) {
  window.removeEventListener("mousemove", onSelDragMove);
  window.removeEventListener("mouseup", onSelDragUp);
  try { map.dragPan.enable(); } catch {}
  if (!selDrag) return;
  const d = selDrag;
  selDrag = null;
  try { d.el.remove(); } catch {}
  suppressSelClick();
  let ex = d.startX, ey = d.startY;
  try { [ex, ey] = containerXY(ev.clientX, ev.clientY); } catch {}
  const m = mergeSelMods(d.mods, domMods(ev));
  finalizeSelShape(d.type, d.startX, d.startY, d.startLngLat, ex, ey, modeOfMods(m), m.alt);
}
function cancelSelDrag() {
  window.removeEventListener("mousemove", onSelDragMove);
  window.removeEventListener("mouseup", onSelDragUp);
  try { map.dragPan.enable(); } catch {}
  try { selDrag?.el?.remove(); } catch {}
  selDrag = null;
}
// کلیک در حالت انتخاب مستطیل/دایره:
// کلیک اول = ثبت لنگر، کلیک دوم = ثبت نهایی (بدون حرکت = نقطه‌ای)
function handleSelAnchorClick(px, py, rawEvent) {
  const tool = props.selectionTool;
  if (tool !== "rectangle" && tool !== "circle") return false;
  if (!map) return true;
  const cur = domMods(rawEvent);
  if (!selAnchor) {
    let startLngLat = null;
    try { startLngLat = map.unproject([px, py]); } catch {}
    selAnchor = { type: tool, startX: px, startY: py, startLngLat, el: makeSelPreviewEl(tool, px, py), mods: cur };
    selAnchorActive.value = true;
    return true;
  }
  const a = selAnchor;
  const m = mergeSelMods(a.mods, cur);
  clearSelAnchor();
  finalizeSelShape(a.type, a.startX, a.startY, a.startLngLat, px, py, modeOfMods(m), m.alt);
  return true;
}

// ─── RAF batching برای عملکرد بهتر ───
let renderRaf = null;
let highlightRaf = null;
let pendingWells = false;
let pendingHighlight = false;
let firstRender = true;
let lastWellsKey = '';

function scheduleRender(force = false) {
  const key = props.wellsKey;
  if (!force && key === lastWellsKey && !firstRender) return;
  lastWellsKey = key;
  pendingWells = true;
  if (!renderRaf) {
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      if (pendingWells) {
        pendingWells = false;
        const doFit = firstRender;
        firstRender = false;
        renderMarkers(doFit);
      }
    });
  }
}

function scheduleHighlight() {
  pendingHighlight = true;
  if (!highlightRaf) {
    highlightRaf = requestAnimationFrame(() => {
      highlightRaf = null;
      if (pendingHighlight) {
        pendingHighlight = false;
        updateHighlightData();
      }
    });
  }
}

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
    const g = feature.geometry ?? feature;
    if (g.type === "Point") return g.coordinates;
    const coords = g.type === "Polygon" ? g.coordinates[0] : (g.type === "LineString" ? g.coordinates : null);
    if (!coords?.length) return null;
    let sx = 0, sy = 0, n = 0;
    for (const c of coords) { if (Number.isFinite(c[0]) && Number.isFinite(c[1])) { sx += c[0]; sy += c[1]; n++; } }
    return n ? [sx / n, sy / n] : null;
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
      text = formatLength(turfLengthLite(f));
    else if (
      f.geometry.type === "Polygon" &&
      f.geometry.coordinates[0]?.length >= 4
    )
      text = formatArea(turfAreaLite(f));
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
    text = formatLength(turfLengthLite(live));
  else if (live.geometry.type === "Polygon") {
    try {
      const a = turfAreaLite(live);
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

async function ensureDrawLoaded() {
  if (MapboxDraw) return;
  ensureMapCss("https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css");
  const m = await import("@mapbox/mapbox-gl-draw");
  MapboxDraw = m.default ?? m;
}

function createDrawInstance(mode, subTool) {
  if (!MapboxDraw) { ensureDrawLoaded().then(() => createDrawInstance(mode, subTool)); return; }
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
  // ابزار انتخاب با ترسیم/اندازه‌گیری هم‌زمان فعال نمی‌ماند
  clearSelAnchor();
  if (props.selectionTool) emit("update:selection-tool", null);
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
const WELL_COLOR = DEFAULT_FEATURE_COLOR;

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
// رنگ‌بندی پیش‌نمایش رابطه مکانی: مبدأ زرد، هدف سبز/قرمز
const PREVIEW_SRC_COLOR = "#eab308";
const PREVIEW_OK_COLOR = "#22c55e";
const PREVIEW_OK_BORDER = "#14532d";
const PREVIEW_FAIL_COLOR = "#ef4444";
const PREVIEW_FAIL_BORDER = "#7f1d1d";
function inIdSet(key, plainId, set) {
  if (!set || set.size === 0) return false;
  if (key && (set.has(key) || (key.includes("::") && set.has(key.slice(key.indexOf("::") + 2))))) return true;
  if (plainId != null && set.has(String(plainId))) return true;
  return false;
}
function previewSets() {
  return {
    legacy: new Set((props.previewIds || []).map(String)),
    src: new Set((props.previewSourceIds || []).map(String)),
    ok: new Set((props.previewOkIds || []).map(String)),
    fail: new Set((props.previewFailIds || []).map(String)),
  };
}
function previewFlags(key, plainId, sets) {
  const isSrc = inIdSet(key, plainId, sets.src) || inIdSet(key, plainId, sets.legacy);
  const isOk = inIdSet(key, plainId, sets.ok);
  const isFail = inIdSet(key, plainId, sets.fail);
  return { isSrc, isOk, isFail, isAny: isSrc || isOk || isFail };
}
// لایه‌هایی که فیلتر توصیفی/مکانی روی آن‌ها اثر می‌کند؛ بقیه باید دست‌نخورده بمانند
function filteredSet() {
  const list = props.filteredLayerUuids
  if (!Array.isArray(list) || !list.length) return null
  return new Set(list.map(String))
}
function isNeutralLayer(layerUuid, fset) {
  if (!fset || !fset.size) return false
  if (layerUuid == null || layerUuid === '') return false
  return !fset.has(String(layerUuid))
}
function layerUuidOfFeature(f) {
  return f?._layerUuid ?? f?.properties?._layerUuid ?? null
}

function buildGeoJSON(wells) {
  // بدون spread کردن _geometry داخل properties (قبلاً کل هندسه هم در props کپی
  // می‌شد و حافظه/سریال‌سازی setData دو برابر سنگین بود)
  const features = []
  for (let i = 0; i < wells.length; i++) {
    const w = wells[i]
    // لایه هیت‌مپ: نقطه پایه رندر نمی‌شود (فقط لایه heatmap)
    const wCfg = props.symConfigs?.[w._layerUuid]
    const geomRaw = w._geometry ?? (Number.isFinite(+w.lat) && Number.isFinite(+w.lng)
      ? { type: "Point", coordinates: [+w.lng, +w.lat] }
      : null)
    if (!geomRaw) continue
    if (wCfg?.renderer === 'heatmap' && (geomRaw.type === 'Point' || geomRaw.type === 'MultiPoint')) continue
    // نکته: نام محلی fp انتخاب شد تا روی props کامپوننت سایه نیندازد (TDZ)
    const { _geometry, ...fp } = w
    // ── سیمبولوژی: استایل پایه از کانفیگ لایه ──
    const sym = symStyleOf(w)
    if (sym) {
      fp._sym_color = sym.color
      fp._sym_stroke = sym.strokeColor
      fp._sym_strokew = sym.strokeWidth
      fp._sym_size = sym.size
      fp._sym_fillop = sym.fillOpacity
      fp._sym_op = sym.opacity
      fp._sym_shape = sym.shape ?? 'circle'
      fp._sym_dash = sym.dash ?? 'solid'
    }
    features.push({ type: "Feature", geometry: geomRaw, properties: fp })
  }
  return { type: "FeatureCollection", features }
}

function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
}

function clearWellLayers() {
  WELL_LAYER_IDS.forEach(
    (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
  );
  if (map.getSource("wells-src")) map.removeSource("wells-src");
}

function escapePopupHtml(text) {
  if (text == null) return "—";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function featureTitle(w, fp) {
  const layerName = w?._layerName ?? fp?._layerName ?? w?.properties?._layerName ?? "";
  const id = w?.id ?? fp?.id ?? "—";
  const safeLayer = layerName ? escapePopupHtml(layerName) : "";
  if (safeLayer) return `${safeLayer} — عارضه #${escapePopupHtml(id)}`;
  return `عارضه #${escapePopupHtml(id)}`;
}

function featureTable(fp) {
  const entries = Object.entries(fp || {})
    .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
    .map(
      ([k, v]) =>
        `<tr><td class="wqa-popup__key">${escapePopupHtml(k)}</td><td class="wqa-popup__val">${escapePopupHtml(v ?? "—")}</td></tr>`,
    )
    .join("");
  const body = entries || `<tr><td class="wqa-popup__val">بدون مشخصات</td></tr>`;
  return `<div class="wqa-popup__scroll"><table class="wqa-popup__table">${body}</table></div>`;
}

function popupHTML(w, props_) {
  return `<div class="wqa-popup">
    <div class="wqa-popup__title">${featureTitle(w, props_)}</div>
    ${featureTable(props_)}
  </div>`;
}

// پاپ‌آپ چندعارضه‌ای (تب‌دار): وقتی چند لایه روی هم افتاده‌اند
function multiPopupHTML(items) {
  if (!Array.isArray(items) || !items.length) return "";
  if (items.length === 1) return popupHTML(items[0].well, items[0].fp);
  const tabs = items
    .map((it, i) => {
      const layerName = it.well?._layerName ?? it.fp?._layerName ?? "";
      const shortLayer = layerName ? String(layerName).slice(0, 14) : "لایه";
      const label = `${escapePopupHtml(shortLayer)} #${escapePopupHtml(it.well?.id ?? it.fp?.id ?? i + 1)}`;
      return `<button type="button" class="wqa-popup__tab${i === 0 ? " wqa-popup__tab--active" : ""}" data-idx="${i}" title="${escapePopupHtml(layerName || "")}">${label}</button>`;
    })
    .join("");
  const pages = items
    .map(
      (it, i) =>
        `<div class="wqa-popup__page${i === 0 ? " wqa-popup__page--active" : ""}" data-idx="${i}">` +
        `<div class="wqa-popup__title">${featureTitle(it.well, it.fp)}</div>${featureTable(it.fp)}</div>`,
    )
    .join("");
  return `<div class="wqa-popup wqa-popup--tabs">
    <div class="wqa-popup__count">${items.length.toLocaleString("fa-IR")} عارضه در این نقطه</div>
    <div class="wqa-popup__tabs" role="tablist">${tabs}</div>
    <div class="wqa-popup__pages">${pages}</div>
  </div>`;
}

function bindPopupTabs(popup) {
  try {
    const el = popup.getElement();
    if (!el) return;
    const tabs = el.querySelectorAll(".wqa-popup__tab");
    const pages = el.querySelectorAll(".wqa-popup__page");
    if (!tabs.length || !pages.length) return;
    tabs.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const idx = btn.getAttribute("data-idx");
        tabs.forEach((t) => t.classList.toggle("wqa-popup__tab--active", t.getAttribute("data-idx") === idx));
        pages.forEach((p) => p.classList.toggle("wqa-popup__page--active", p.getAttribute("data-idx") === idx));
      });
    });
  } catch {}
}

// جمع‌آوری همه عارضه‌های زیر نقطه کلیک (حذف تکراری fill/line یک پلی‌گان + سقف تب)
function collectStackedFeatures(e) {
  const MAX_TABS = 10;
  const seen = new Set();
  const items = [];
  try {
    const layerIds = WELL_LAYER_IDS.filter((id) => {
      try { return map.getLayer(id); } catch { return false; }
    });
    const rendered = map.queryRenderedFeatures(e.point, { layers: layerIds });
    for (const f of rendered || []) {
      const fp = f.properties || {};
      const fpKey = wellKey({ properties: fp, id: fp.id });
      if (!fpKey || seen.has(fpKey)) continue;
      seen.add(fpKey);
      const well = props.wells.find((w) => wellKey(w) === fpKey)
        ?? props.wells.find((w) => String(w.id) === String(fp.id));
      if (!well) continue;
      items.push({ well, fp });
      if (items.length >= MAX_TABS) break;
    }
  } catch {}
  // fallback: حداقل همان فیچر کلیک‌شده
  if (!items.length && e.features?.length) {
    const fp = e.features[0].properties || {};
    const fpKey = wellKey({ properties: fp, id: fp.id });
    const well = props.wells.find((w) => wellKey(w) === fpKey)
      ?? props.wells.find((w) => String(w.id) === String(fp.id));
    if (well) items.push({ well, fp });
  }
  return items;
}

// پاپ‌آپ آخرین کلیک ابزار «اطلاعات» — برای بستن/پاک‌سازی هنگام غیرفعال‌سازی ابزار
let lastInfoPopup = null;
// بسته شدن پاپ‌آپ اطلاعات → حذف هایلایت آبی (فقط اگر همان پاپ‌آپ آخری باشد)
function onInfoPopupClose(popup) {
  try {
    if (lastInfoPopup !== popup) return;
    lastInfoPopup = null;
    emit("update:info-well-key", null);
  } catch {}
}
function showStackedPopup(items, lngLat) {
  const popup = new mapboxgl.Popup({ maxWidth: "340px" })
    .setLngLat(lngLat)
    .setHTML(multiPopupHTML(items))
    .addTo(map);
  bindPopupTabs(popup);
  popup.on("close", () => onInfoPopupClose(popup));
  lastInfoPopup = popup;
  return popup;
}

const boundWellLayers = new Set();
function bindWellEventsOnce() {
  // لایه‌هایی که بعداً ساخته می‌شوند (dash/dot/شکل نقطه‌ای) هم در رندرهای بعدی بایند می‌گیرند
  WELL_LAYER_IDS.forEach(
    (layerId) => {
      if (boundWellLayers.has(layerId)) return;
      let has = false;
      try { has = !!map.getLayer(layerId); } catch {}
      if (!has) return;
      boundWellLayers.add(layerId);
      map.on("click", layerId, (e) => {
        if (activeMode.value) return;
        // در حالت انتخاب هوشمند، هندلر کلیک نقشه تصمیم می‌گیرد (جلوگیری از دابل‌فایر)
        if (picking) return;
        // ── ابزارهای انتخاب عارضه + ابزار اطلاعات ──
        if (selecting && props.selectionTool) {
          if (isSelClickSuppressed()) return;
          try { syncModsFromDomEvent(e?.originalEvent); } catch {}
          try {
            if (props.selectionTool === "info") {
              // ابزار اطلاعات: عارضه آبی پر رنگ + نمایش مشخصات
              const items = collectStackedFeatures(e);
              if (!items.length) return;
              emit("info-select", items[0].well);
              showStackedPopup(items, e.lngLat);
            } else if (props.selectionTool === "point") {
              if (e.point) selectAtPixel(e.point.x, e.point.y, resolveSelMode(e), isContainedOnly(e));
            } else if (e.point) {
              handleSelAnchorClick(e.point.x, e.point.y, e);
            }
          } catch {}
          return;
        }
        // ── کلیک عادی (بدون ابزار): انتخاب دستی ──
        if (isSelClickSuppressed()) return;
        try { syncModsFromDomEvent(e?.originalEvent); } catch {}
        try {
          if (e.point) selectAtPixel(e.point.x, e.point.y, resolveSelMode(e), isContainedOnly(e));
        } catch {}
      });
      map.on("mouseenter", layerId, () => {
        if (selecting && props.selectionTool) return;
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = (selecting && props.selectionTool)
          ? (props.selectionTool === "info" ? "pointer" : "crosshair")
          : "";
      });
    },
  );
}

function fitGeoJSON(geojson) {
  try {
    const bounds = new mapboxgl.LngLatBounds();
    // روی مجموعه‌های بزرگ فقط نمونه برای bounds کافی است (fit دقیق لازم نیست)
    const feats = geojson.features;
    const step = feats.length > 2000 ? Math.ceil(feats.length / 2000) : 1;
    for (let i = 0; i < feats.length; i += step) {
      const g = feats[i].geometry;
      if (!g) continue;
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
    }
    if (!bounds.isEmpty())
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 800 });
  } catch {}
}

// ─── لایه‌های سبک خط (dash/dot) و شکل نقطه (symbol) ───
// line-dasharray داده‌محور نیست؛ هر سبک یک لایه جدا با فیلتر _sym_dash دارد.
function _statusColorExpr(failC, okC) {
  return [
    "case",
    ["==", ["get", "_sel"], 1], SEL_COLOR,
    ["==", ["get", "_infoKey"], 1], INFO_COLOR,
    ["==", ["get", "_pfail"], 1], failC,
    ["==", ["get", "_pok"], 1], okC,
    ["==", ["get", "_psrc"], 1], PREVIEW_SRC_COLOR,
    ["==", ["get", "_selected"], 1], "#f0a500",
    ["==", ["get", "_isCenter"], 1], "#e74c3c",
  ];
}
function _polyOutlineColor() {
  return [..._statusColorExpr(PREVIEW_FAIL_BORDER, PREVIEW_OK_BORDER),
    ["==", ["get", "_match"], 1], "#14532d",
    ["==", ["get", "_dimmed"], 1], "#8a9490",
    ["!=", ["get", "_sym_color"], null],
    ["coalesce", ["get", "_sym_stroke"], ["get", "_sym_color"]],
    ["==", ["get", "_match"], 1], "#14532d",
    ["==", ["get", "_highlighted"], 1], "#4a9b8e",
    "#8a9490",
  ];
}
function _polylineColor() {
  return [..._statusColorExpr(PREVIEW_FAIL_COLOR, PREVIEW_OK_COLOR),
    ["==", ["get", "_match"], 1], "#22c55e",
    ["==", ["get", "_dimmed"], 1], "#8a9490",
    ["!=", ["get", "_sym_color"], null], ["get", "_sym_color"],
    ["==", ["get", "_match"], 1], "#22c55e",
    ["==", ["get", "_highlighted"], 1], "#4a9b8e",
    "#8a9490",
  ];
}
function _lineWidthPoly() {
  return [
    "case",
    ["==", ["get", "_sel"], 1], 4,
    ["==", ["get", "_infoKey"], 1], 4,
    ["==", ["get", "_pfail"], 1], 4,
    ["==", ["get", "_pok"], 1], 4,
    ["==", ["get", "_psrc"], 1], 4,
    ["==", ["get", "_selected"], 1], 4,
    ["==", ["get", "_isCenter"], 1], 4,
    ["!=", ["get", "_sym_strokew"], null], ["get", "_sym_strokew"],
    ["!=", ["get", "_sym_size"], null], ["get", "_sym_size"],
    ["==", ["get", "_match"], 1], 3.5,
    ["==", ["get", "_highlighted"], 1], 3,
    1.5,
  ];
}
function _lineWidthLine() {
  return [
    "case",
    ["==", ["get", "_sel"], 1], 4,
    ["==", ["get", "_infoKey"], 1], 4,
    ["==", ["get", "_pfail"], 1], 4,
    ["==", ["get", "_pok"], 1], 4,
    ["==", ["get", "_psrc"], 1], 4,
    ["==", ["get", "_selected"], 1], 4,
    ["==", ["get", "_isCenter"], 1], 4,
    ["!=", ["get", "_sym_strokew"], null], ["get", "_sym_strokew"],
    ["!=", ["get", "_sym_size"], null], ["get", "_sym_size"],
    ["==", ["get", "_match"], 1], 3.5,
    ["==", ["get", "_highlighted"], 1], 3,
    ["==", ["get", "_dimmed"], 1], 1,
    1.5,
  ];
}
function _lineOpacity(dimmedVal) {
  return [
    "case",
    ["==", ["get", "_sel"], 1], 1,
    ["==", ["get", "_infoKey"], 1], 1,
    ["==", ["get", "_pfail"], 1], 1,
    ["==", ["get", "_pok"], 1], 1,
    ["==", ["get", "_psrc"], 1], 1,
    ["==", ["get", "_selected"], 1], 1,
    ["==", ["get", "_highlighted"], 1], 1,
    ["==", ["get", "_dimmed"], 1], dimmedVal,
    ["coalesce", ["get", "_sym_op"], 1],
  ];
}
function _pointColor() {
  return [..._statusColorExpr(PREVIEW_FAIL_COLOR, PREVIEW_OK_COLOR),
    ["==", ["get", "_match"], 1], "#22c55e",
    ["==", ["get", "_dimmed"], 1], "#8a9490",
    ["!=", ["get", "_sym_color"], null], ["get", "_sym_color"],
    ["==", ["get", "_match"], 1], "#22c55e",
    ["==", ["get", "_dimmed"], 1], "#8a9490",
    ["get", "_color"],
  ];
}
function _pointHalo() {
  return [
    "case",
    ["==", ["get", "_sel"], 1], SEL_BORDER,
    ["==", ["get", "_infoKey"], 1], "#ffffff",
    ["==", ["get", "_pfail"], 1], PREVIEW_FAIL_BORDER,
    ["==", ["get", "_pok"], 1], PREVIEW_OK_BORDER,
    ["==", ["get", "_psrc"], 1], "#1a1a1a",
    ["==", ["get", "_selected"], 1], "#1a1a1a",
    ["==", ["get", "_isCenter"], 1], "#fff",
    ["==", ["get", "_match"], 1], "#14532d",
    ["==", ["get", "_dimmed"], 1], "#8a9490",
    ["!=", ["get", "_sym_stroke"], null], ["get", "_sym_stroke"],
    ["==", ["get", "_match"], 1], "#14532d",
    ["==", ["get", "_highlighted"], 1], "#1a1a1a",
    ["==", ["get", "_dimmed"], 1], "#666",
    ["==", ["get", "_match"], 1], "#14532d",
    ["==", ["get", "_dimmed"], 1], "#8a9490",
    ["!=", ["get", "_sym_stroke"], null], ["get", "_sym_stroke"],
    "#ffffff",
  ];
}
function _pointOpacity() {
  return [
    "case",
    ["==", ["get", "_sel"], 1], 1,
    ["==", ["get", "_infoKey"], 1], 1,
    ["==", ["get", "_pfail"], 1], 1,
    ["==", ["get", "_pok"], 1], 1,
    ["==", ["get", "_psrc"], 1], 1,
    ["==", ["get", "_selected"], 1], 1,
    ["==", ["get", "_isCenter"], 1], 1,
    ["==", ["get", "_dimmed"], 1], 0.5,
    ["coalesce", ["get", "_sym_op"], 1],
  ];
}
function _pointTextSize() {
  return [
    "case",
    ["==", ["get", "_isCenter"], 1], 26,
    ["*", ["coalesce", ["get", "_sym_size"], 6], 2.4],
  ];
}
function addDashAndShapeLayers() {
  if (!map || !map.getSource("wells-src")) return;
  const polyGeoms = ["literal", ["Polygon", "MultiPolygon"]];
  const lineGeoms = ["literal", ["LineString", "MultiLineString"]];
  const ptGeoms = ["literal", ["Point", "MultiPoint"]];
  const dashStyles = [
    { suffix: "dash", dash: "dash", array: [2.5, 2] },
    { suffix: "dot", dash: "dot", array: [0, 2.5] },
  ];
  for (const d of dashStyles) {
    const lid = "wells-line-" + d.suffix;
    if (!map.getLayer(lid)) {
      map.addLayer({
        id: lid, type: "line", source: "wells-src",
        filter: ["all", ["in", ["geometry-type"], polyGeoms], ["==", ["get", "_sym_dash"], d.dash]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": _polyOutlineColor(),
          "line-width": _lineWidthPoly(),
          "line-opacity": _lineOpacity(0.4),
          "line-dasharray": d.array,
        },
      });
    }
    const plid = "wells-polyline-" + d.suffix;
    if (!map.getLayer(plid)) {
      map.addLayer({
        id: plid, type: "line", source: "wells-src",
        filter: ["all", ["in", ["geometry-type"], lineGeoms], ["==", ["get", "_sym_dash"], d.dash]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": _polylineColor(),
          "line-width": _lineWidthLine(),
          "line-opacity": _lineOpacity(0.5),
          "line-dasharray": d.array,
        },
      });
    }
  }
  for (const s of POINT_SHAPES) {
    const lid = "wells-pt-" + s.id;
    if (map.getLayer(lid)) continue;
    map.addLayer({
      id: lid, type: "symbol", source: "wells-src",
      filter: ["all", ["in", ["geometry-type"], ptGeoms], ["==", ["get", "_sym_shape"], s.id]],
      layout: {
        "text-field": s.char,
        "text-size": _pointTextSize(),
        "text-allow-overlap": true,
        "text-ignore-placement": true,
        "text-anchor": "center",
      },
      paint: {
        "text-color": _pointColor(),
        "text-halo-color": _pointHalo(),
        "text-halo-width": ["coalesce", ["get", "_sym_strokew"], 1.5],
        "text-opacity": _pointOpacity(),
      },
    });
  }
}

function renderMarkers(fit = true) {
  if (!map || !map.isStyleLoaded()) return;
  const highlightSet = new Set((props.highlightedIds || []).map(String));
  const psets = previewSets();
  const centerKey = wellKey(props.radiusCenter);
  const selectedKey = props.selectedId != null && props.selectedId !== '' ? String(props.selectedId) : null;
  const infoKey = props.infoWellKey != null && props.infoWellKey !== '' ? String(props.infoWellKey) : null;
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    clearMarkers();
    const geojson = buildGeoJSON(props.wells);
    wellsGeoJSON = geojson;
    const fset = filteredSet();
    const selSet = new Set((props.selectionIds || []).map(String));
    const inSel = (key, plainId) => {
      if (!selSet.size) return false;
      if (key && (selSet.has(key) || (key.includes("::") && selSet.has(key.slice(key.indexOf("::") + 2))))) return true;
      if (plainId != null && selSet.has(String(plainId))) return true;
      return false;
    };
    geojson.features.forEach((f) => {
      const key = wellKey(f);
      const neutral = isNeutralLayer(layerUuidOfFeature(f), fset);
      const hl = neutral ? false : inHighlightSet(key, highlightSet);
      const match = props.hasFilter && hl && !neutral;
      const { isSrc, isOk, isFail, isAny } = previewFlags(key, f.properties.id, psets);
      const isSel = inSel(key, f.properties.id);
      f.properties._color = WELL_COLOR;
      f.properties._highlighted = hl ? 1 : 0;
      f.properties._dimmed = (!neutral && props.hasFilter && !hl && !isAny && !isSel) ? 1 : 0;
      f.properties._match = match ? 1 : 0;
      f.properties._sel = isSel ? 1 : 0;
      f.properties._infoKey = (infoKey && (key === infoKey || String(f.properties.id) === infoKey)) ? 1 : 0;
      f.properties._psrc = isSrc && !isOk && !isFail ? 1 : 0;
      f.properties._pok = isOk ? 1 : 0;
      f.properties._pfail = isFail ? 1 : 0;
      f.properties._isCenter =
        centerKey && key === centerKey ? 1 : 0;
      // مجموعه انتخاب هم دقیقاً مسیر کلیک عادی (_selected زرد) را می‌گیرد تا حتماً دیده شود
      f.properties._selected =
        ((selectedKey && (key === selectedKey || String(f.properties.id) === selectedKey)) || isAny || isSel) ? 1 : 0;
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
          ["==", ["get", "_sel"], 1],
          SEL_COLOR,
          ["==", ["get", "_infoKey"], 1],
          INFO_COLOR,
          ["==", ["get", "_pfail"], 1],
          PREVIEW_FAIL_COLOR,
          ["==", ["get", "_pok"], 1],
          PREVIEW_OK_COLOR,
          ["==", ["get", "_psrc"], 1],
          PREVIEW_SRC_COLOR,
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          // سیمبولوژی لایه بر هایلایت/مچ اولویت دارد تا تغییرات کاربر همیشه دیده شود
          ["==", ["get", "_match"], 1], "#22c55e",
          ["==", ["get", "_dimmed"], 1], "#8a9490",
          ["!=", ["get", "_sym_color"], null],
          ["get", "_sym_color"], // سیمبولوژی لایه
          ["==", ["get", "_match"], 1],
          "#22c55e", // داخل کوئری → سبز مشخص
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e", // فیلتر شده → رنگ
          "#8a9490", // عادی → خاکستری
        ],
        "fill-opacity": [
          "case",
          ["==", ["get", "_sel"], 1],
          0.55,
          ["==", ["get", "_infoKey"], 1],
          1,
          ["==", ["get", "_pfail"], 1],
          0.6,
          ["==", ["get", "_pok"], 1],
          0.65,
          ["==", ["get", "_psrc"], 1],
          0.6,
          ["==", ["get", "_selected"], 1],
          0.6,
          ["==", ["get", "_isCenter"], 1],
          0.55,
          ["==", ["get", "_match"], 1],
          0.65,
          ["==", ["get", "_highlighted"], 1],
          0.55,
          ["==", ["get", "_dimmed"], 1],
          0.25,
          ["coalesce", ["get", "_sym_fillop"], 0.2], // عادی: شفافیت سیمبولوژی
        ],
      },
    });
    map.addLayer({
      id: "wells-line",
      type: "line",
      source: "wells-src",
      filter: [
        "all",
        ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
        ["!", ["in", ["get", "_sym_dash"], ["literal", ["dash", "dot"]]]],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "_sel"], 1],
          SEL_COLOR,
          ["==", ["get", "_infoKey"], 1],
          INFO_COLOR,
          ["==", ["get", "_pfail"], 1],
          PREVIEW_FAIL_BORDER,
          ["==", ["get", "_pok"], 1],
          PREVIEW_OK_BORDER,
          ["==", ["get", "_psrc"], 1],
          PREVIEW_SRC_COLOR,
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1], "#14532d",
          ["==", ["get", "_dimmed"], 1], "#8a9490",
          ["!=", ["get", "_sym_color"], null],
          ["coalesce", ["get", "_sym_stroke"], ["get", "_sym_color"]],
          ["==", ["get", "_match"], 1],
          "#14532d",
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e",
          "#8a9490",
        ],
        "line-width": [
          "case",
          ["==", ["get", "_sel"], 1],
          4,
          ["==", ["get", "_infoKey"], 1],
          4,
          ["==", ["get", "_pfail"], 1],
          4,
          ["==", ["get", "_pok"], 1],
          4,
          ["==", ["get", "_psrc"], 1],
          4,
          ["==", ["get", "_selected"], 1],
          4,
          ["==", ["get", "_isCenter"], 1],
          4,
          ["!=", ["get", "_sym_strokew"], null],
          ["get", "_sym_strokew"],
          ["!=", ["get", "_sym_size"], null],
          ["get", "_sym_size"],
          ["==", ["get", "_match"], 1],
          3.5,
          ["==", ["get", "_highlighted"], 1],
          3,
          1.5,
        ],
        "line-opacity": [
          "case",
          ["==", ["get", "_pfail"], 1],
          1,
          ["==", ["get", "_pok"], 1],
          1,
          ["==", ["get", "_psrc"], 1],
          1,
          ["==", ["get", "_selected"], 1],
          1,
          ["==", ["get", "_highlighted"], 1],
          1,
          ["==", ["get", "_dimmed"], 1],
          0.4,
          0.5,
        ],
      },
    });
    map.addLayer({
      id: "wells-polyline",
      type: "line",
      source: "wells-src",
      filter: [
        "all",
        ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
        ["!", ["in", ["get", "_sym_dash"], ["literal", ["dash", "dot"]]]],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-width": [
          "case",
          ["==", ["get", "_sel"], 1],
          4,
          ["==", ["get", "_infoKey"], 1],
          4,
          ["==", ["get", "_pfail"], 1],
          4,
          ["==", ["get", "_pok"], 1],
          4,
          ["==", ["get", "_psrc"], 1],
          4,
          ["==", ["get", "_selected"], 1],
          4,
          ["==", ["get", "_isCenter"], 1],
          4,
          ["!=", ["get", "_sym_strokew"], null],
          ["get", "_sym_strokew"],
          ["!=", ["get", "_sym_size"], null],
          ["get", "_sym_size"],
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
          ["==", ["get", "_sel"], 1],
          SEL_COLOR,
          ["==", ["get", "_infoKey"], 1],
          INFO_COLOR,
          ["==", ["get", "_pfail"], 1],
          PREVIEW_FAIL_COLOR,
          ["==", ["get", "_pok"], 1],
          PREVIEW_OK_COLOR,
          ["==", ["get", "_psrc"], 1],
          PREVIEW_SRC_COLOR,
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1], "#22c55e",
          ["==", ["get", "_dimmed"], 1], "#8a9490",
          ["!=", ["get", "_sym_color"], null],
          ["get", "_sym_color"],
          ["==", ["get", "_match"], 1],
          "#22c55e",
          ["==", ["get", "_highlighted"], 1],
          "#4a9b8e",
          "#8a9490",
        ],
        "line-opacity": [
          "case",
          ["==", ["get", "_sel"], 1],
          1,
          ["==", ["get", "_infoKey"], 1],
          1,
          ["==", ["get", "_dimmed"], 1],
          0.5,
          ["coalesce", ["get", "_sym_op"], 1],
        ],
      },
    });
    map.addLayer({
      id: "wells-point",
      type: "circle",
      source: "wells-src",
      filter: ["all", ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]], ["!", ["in", ["get", "_sym_shape"], ["literal", ["square", "triangle", "diamond", "cross", "star"]]]]],
      paint: {
        "circle-radius": [
          "case",
          ["==", ["get", "_infoKey"], 1],
          12,
          ["==", ["get", "_pfail"], 1],
          12,
          ["==", ["get", "_pok"], 1],
          12,
          ["==", ["get", "_psrc"], 1],
          12,
          ["==", ["get", "_isCenter"], 1],
          12,
          ["!=", ["get", "_sym_size"], null],
          ["get", "_sym_size"],
          4.5,
        ],
        "circle-color": [
          "case",
          ["==", ["get", "_sel"], 1],
          SEL_COLOR,
          ["==", ["get", "_infoKey"], 1],
          INFO_COLOR,
          ["==", ["get", "_pfail"], 1],
          PREVIEW_FAIL_COLOR,
          ["==", ["get", "_pok"], 1],
          PREVIEW_OK_COLOR,
          ["==", ["get", "_psrc"], 1],
          PREVIEW_SRC_COLOR,
          ["==", ["get", "_selected"], 1],
          "#f0a500",
          ["==", ["get", "_isCenter"], 1],
          "#e74c3c",
          ["==", ["get", "_match"], 1], "#22c55e",
          ["==", ["get", "_dimmed"], 1], "#8a9490",
          ["!=", ["get", "_sym_color"], null],
          ["get", "_sym_color"],
          ["==", ["get", "_match"], 1],
          "#22c55e",
          ["==", ["get", "_dimmed"], 1],
          "#8a9490",
          ["get", "_color"],
        ],
        "circle-opacity": [
          "case",
          ["==", ["get", "_sel"], 1],
          1,
          ["==", ["get", "_infoKey"], 1],
          1,
          ["==", ["get", "_pfail"], 1],
          1,
          ["==", ["get", "_pok"], 1],
          1,
          ["==", ["get", "_psrc"], 1],
          1,
          ["==", ["get", "_selected"], 1],
          1,
          ["==", ["get", "_isCenter"], 1],
          1,
          ["==", ["get", "_dimmed"], 1],
          0.5,
          ["coalesce", ["get", "_sym_op"], 1],
        ],
        "circle-stroke-width": [
          "case",
          ["==", ["get", "_infoKey"], 1],
          3,
          ["==", ["get", "_pfail"], 1],
          3,
          ["==", ["get", "_pok"], 1],
          3,
          ["==", ["get", "_psrc"], 1],
          3,
          ["==", ["get", "_isCenter"], 1],
          3,
          ["coalesce", ["get", "_sym_strokew"], 2],
        ],
        "circle-stroke-color": [
          "case",
          ["==", ["get", "_infoKey"], 1],
          INFO_BORDER,
          ["==", ["get", "_pfail"], 1],
          PREVIEW_FAIL_BORDER,
          ["==", ["get", "_pok"], 1],
          PREVIEW_OK_BORDER,
          ["==", ["get", "_psrc"], 1],
          "#1a1a1a",
          ["==", ["get", "_isCenter"], 1],
          "#fff",
          ["==", ["get", "_match"], 1], "#14532d",
          ["==", ["get", "_dimmed"], 1], "#8a9490",
          ["!=", ["get", "_sym_stroke"], null],
          ["get", "_sym_stroke"],
          ["==", ["get", "_match"], 1],
          "#14532d",
          ["==", ["get", "_highlighted"], 1],
          "#1a1a1a",
          ["==", ["get", "_dimmed"], 1],
          "#666",
          ["==", ["get", "_match"], 1], "#14532d",
          ["==", ["get", "_dimmed"], 1], "#8a9490",
          ["!=", ["get", "_sym_stroke"], null],
          ["get", "_sym_stroke"],
          "#ffffff",
        ],
        "circle-stroke-opacity": [
          "case",
          ["==", ["get", "_sel"], 1],
          1,
          ["==", ["get", "_infoKey"], 1],
          1,
          ["==", ["get", "_pfail"], 1],
          1,
          ["==", ["get", "_pok"], 1],
          1,
          ["==", ["get", "_psrc"], 1],
          1,
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
    addDashAndShapeLayers();
    bindWellEventsOnce();
    }
    if (fit) fitGeoJSON(geojson);
  } else {
    clearWellLayers();
    clearMarkers();
    wellsGeoJSON = null;
    // سقف مارکر DOM (لایه‌های بدون هندسه): هزاران مارکر صفحه را قفل می‌کند
    const MARKER_CAP = 3000;
    const list = props.wells.length > MARKER_CAP ? props.wells.slice(0, MARKER_CAP) : props.wells;
    const fsetPt = filteredSet();
    const selSetPt = new Set((props.selectionIds || []).map(String));
    list.forEach((w) => {
      if (!Number.isFinite(+w.lat) || !Number.isFinite(+w.lng)) return;
      const key = wellKey(w);
      const neutral = isNeutralLayer(w._layerUuid, fsetPt);
      const isH = neutral ? false : inHighlightSet(key, highlightSet);
      const { isSrc, isOk, isFail, isAny } = previewFlags(key, w.id, psets);
      const inSelSet = selSetPt.size > 0 && (selSetPt.has(String(key)) || selSetPt.has(String(w.id)));
      const isDimmed = !neutral && props.hasFilter && !isH && !isAny && !inSelSet;
      const isMatch = !neutral && props.hasFilter && isH;
      const isCenter = centerKey && key === centerKey;
      const isInfo = infoKey && (key === infoKey || String(w.id) === infoKey);
      const isSel = (selectedKey && (key === selectedKey || String(w.id) === selectedKey)) || isAny || inSelSet;
      const sym = symStyleOf(w);
      const symColor = sym?.color ?? null;
      const color = inSelSet
        ? SEL_COLOR
        : isInfo
          ? INFO_COLOR
          : isFail
          ? PREVIEW_FAIL_COLOR
          : isOk
            ? PREVIEW_OK_COLOR
            : isSrc
              ? PREVIEW_SRC_COLOR
              : isSel
                ? "#f0a500"
                : isCenter
                  ? "#e74c3c"
                  : (isMatch ? "#22c55e" : isDimmed ? "#8a9490" : (symColor ?? DEFAULT_FEATURE_COLOR));
      const opacity = inSelSet || isInfo || isSel || isCenter || isMatch ? "1" : isDimmed ? "0.5" : String(sym?.opacity ?? 1);
      const strokeW = isCenter || isInfo ? 3 : Math.max(0, Math.min(6, Number(sym?.strokeWidth ?? 2)));
      const strokeC = sym?.strokeColor ?? "rgba(255,255,255,0.4)";
      const border = inSelSet
        ? strokeW + "px solid " + strokeC
        : isInfo
          ? `3px solid ${INFO_BORDER}`
          : isFail
          ? `3px solid ${PREVIEW_FAIL_BORDER}`
          : isOk
            ? `3px solid ${PREVIEW_OK_BORDER}`
            : isCenter
                ? "3px solid #fff"
                : sym
                  ? strokeW + "px solid " + strokeC
                : isMatch
                  ? "3px solid #14532d"
                  : isH
                    ? "3px solid #fff"
                    : `${strokeW}px solid ${strokeC}`;
      const symSize = Math.max(4, Math.min(30, Number(sym?.size) || 8));
      const size = symSize;
      const shape = sym?.shape ?? 'circle';
      const shapeCss = shape === 'square'
        ? 'border-radius:4px;'
        : shape === 'diamond'
          ? 'border-radius:4px;transform:rotate(45deg);'
          : shape === 'triangle'
            ? `clip-path:polygon(50% 4%, 96% 94%, 4% 94%);border-radius:0;`
            : shape === 'cross' || shape === 'star'
              ? `border-radius:50%;`
              : 'border-radius:50%;';
      const el = document.createElement("div");
      el.title = shape === 'star' ? '★' : shape === 'cross' ? '✕' : '';
      el.style.cssText = `
      width:${size}px;height:${size}px;${shapeCss}
      background:${color};border:${border};
      box-shadow:0 2px 6px rgba(0,0,0,0.4);cursor:pointer;
      opacity:${opacity};
      ${shape === 'cross' ? `background:linear-gradient(${color},${color}) center/60% 18% no-repeat, linear-gradient(${color},${color}) center/18% 60% no-repeat;` : ''}
      ${isCenter || isMatch ? "outline:3px solid rgba(34,197,94,0.45);outline-offset:3px;" : (isInfo ? "outline:3px solid rgba(255,255,255,0.75);outline-offset:3px;" : (isH ? "outline:3px solid rgba(240,165,0,0.4);outline-offset:3px;" : ""))}`;
      // عارضه‌های هم‌مختصات (دو لایه روی هم) → تب در یک پاپ‌آپ
      const stacked = props.wells.filter(
        (o) => Number.isFinite(+o.lat) && Number.isFinite(+o.lng) && +o.lat === +w.lat && +o.lng === +w.lng,
      ).slice(0, 10);
      const markerItems = (stacked.length > 1 ? stacked : [w]).map((s) => {
        const { _geometry, ...fp } = s;
        return { well: s, fp };
      });
      const popup = new mapboxgl.Popup({ offset: 14, maxWidth: "340px" })
        .setHTML(multiPopupHTML(markerItems));
      popup.on("open", () => bindPopupTabs(popup));
      popup.on("close", () => onInfoPopupClose(popup));
      el.addEventListener("click", (e) => {
        if (activeMode.value) {
          e.stopPropagation();
          return;
        }
        // در حالت انتخاب هوشمند از پیکر نقشه استفاده می‌شود؛ جلوی دابل‌فایر گرفته شود
        if (picking) {
          e.stopPropagation();
          emit("select-well", w);
          return;
        }
        if (selecting && props.selectionTool) {
          // ابزار اطلاعات: عارضه آبی پر رنگ + نمایش مشخصات
          if (props.selectionTool === "info") {
            e.stopPropagation();
            emit("info-select", w);
            popup.openPopup();
            lastInfoPopup = popup;
            return;
          }
          e.stopPropagation();
          if (isSelClickSuppressed()) return;
          try { syncModsFromDomEvent(e); } catch {}
          try {
            const rect = map.getContainer().getBoundingClientRect();
            const px = e.clientX - rect.left, py = e.clientY - rect.top;
            if (props.selectionTool === "point") {
              selectAtPixel(px, py, resolveSelMode(e), isContainedOnly(e));
            } else {
              handleSelAnchorClick(px, py, e);
            }
          } catch {}
          // کلیک مارکر ممکن است به نقشه هم برسد؛ ژست فقط یک‌بار ثبت شود
          suppressSelClick(300);
          return;
        }
        // کلیک عادی (بدون ابزار) = انتخاب دستی؛ بدون پاپ‌آپ
        if (isSelClickSuppressed()) return;
        try { syncModsFromDomEvent(e); } catch {}
        try {
          const rect = map.getContainer().getBoundingClientRect();
          const px = e.clientX - rect.left, py = e.clientY - rect.top;
          selectAtPixel(px, py, resolveSelMode(e), isContainedOnly(e));
        } catch {}
      });
      markers.push(
        new mapboxgl.Marker(el)
          .setLngLat([w.lng, w.lat])
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
  lastSymStruct = symStructSig();
  refreshSymLayers();
}

// ─── mount ─────────────────────────────────────────────────
let mouseRafPending = false;
function onMouseMove(e) {
  if (mouseRafPending) return;
  mouseRafPending = true;
  requestAnimationFrame(async () => {
    mouseRafPending = false;
    mouse.value.lat = e.lngLat.lat.toFixed(6);
    mouse.value.lng = e.lngLat.lng.toFixed(6);
    try {
      if (!utmMod) utmMod = await import("utm");
      const p = (utmMod.fromLatLon ?? utmMod.default?.fromLatLon)(e.lngLat.lat, e.lngLat.lng);
      mouse.value.utm = `Zone ${p.zoneNum}${p.zoneLetter} | E ${p.easting.toFixed(2)} | N ${p.northing.toFixed(2)}`;
    } catch {}
    if (activeMode.value === "measure") updateLiveLabel();
  });
}

onMounted(async () => {
  const [{ default: mb }] = await Promise.all([
    import("mapbox-gl"),
  ]);
  mapboxgl = mb;
  ensureMapCss("https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css");
  mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "pk.YOUR_TOKEN_HERE";
  try {
    if (mapboxgl.getRTLTextPluginStatus() === "unavailable") {
      mapboxgl.setRTLTextPlugin(
        "https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-rtl-text/v0.2.3/mapbox-gl-rtl-text.js",
        null,
        true,
      );
    }
  } catch {}
  const weak = (() => { try { return (navigator?.deviceMemory ?? 8) <= 4 || (navigator?.hardwareConcurrency ?? 8) <= 4; } catch { return false; } })();
  map = new mapboxgl.Map({
    container: mapEl.value,
    style: lastStyle,
    center: [53, 32],
    zoom: 5,
    attributionControl: false,
    antialias: !weak,
    preserveDrawingBuffer: false,
    trackResize: true,
    fadeDuration: weak ? 0 : 300,
  });
  map.addControl(new mapboxgl.NavigationControl(), "bottom-left");
  // کلیک روی فضای خالی → deselect عارضه (فقط وقتی به عارضه/شکل رسم‌شده نخورده)
  map.on("click", (e) => {
    if (picking) return;
    if (selecting && props.selectionTool) {
      // دنباله درگ/مارکر: این کلیک قبلاً ثبت شده
      if (isSelClickSuppressed()) return;
      try { syncModsFromDomEvent(e?.originalEvent); } catch {}
      // کلیک روی مارکر DOM را هندلر مارکر انجام داده است
      try {
        if (e?.originalEvent?.target?.closest?.(".mapboxgl-marker,.mapboxgl-popup")) return;
      } catch {}
      // مستطیل/دایره نقطه‌ای: کلیک اول لنگر، کلیک دوم ثبت (روی عارضه یا فضای خالی فرقی ندارد)
      if (props.selectionTool === "rectangle" || props.selectionTool === "circle") {
        try {
          // اگر کلیک روی عارضه بوده، هندلر لایه قبلاً اجرا شده؛ برای جلوگیری از ثبت دوبار،
          // فقط وقتی هیچ عارضه‌ای زیر کلیک نیست اینجا لنگر را جلو می‌بریم
          const layerIds = [...WELL_LAYER_IDS].filter((id) => { try { return map.getLayer(id); } catch { return false; } });
          let onFeature = false;
          try {
            const feats = layerIds.length ? map.queryRenderedFeatures(e.point, { layers: layerIds }) : [];
            onFeature = !!(feats && feats.length);
          } catch {}
          if (onFeature) return; // هندلر لایه مسئول است
          handleSelAnchorClick(e.point.x, e.point.y, e);
        } catch {}
        return;
      }
      // ابزار دستی: کلیک روی فضای خالی در حالت «جدید» → پاک شدن انتخاب
      if (props.selectionTool === "point" && resolveSelMode(e) === "new") {
        try {
          const layerIds = [...WELL_LAYER_IDS].filter((id) => map.getLayer(id));
          const feats = layerIds.length ? map.queryRenderedFeatures(e.point, { layers: layerIds }) : [];
          if (feats && feats.length) return;
        } catch {}
        emit("selection-change", [], "new");
      }
      return;
    }
    try {
      const layerIds = [
        ...WELL_LAYER_IDS,
        "drawn-polygon-fill", "drawn-polygon-stroke", "drawn-line", "drawn-point",
      ].filter((id) => map.getLayer(id));
      const feats = layerIds.length ? map.queryRenderedFeatures(e.point, { layers: layerIds }) : [];
      if (feats && feats.length) return;
    } catch {}
    // کلیک عادی روی فضای خالی → پاک کردن انتخاب فعلی (مثل ابزار دستی)
    if (props.selectionCount > 0) emit("selection-change", [], "new");
    emit("map-empty-click");
  });
  // چرخش/زاویه نقشه از ابتدا غیرفعال تا Ctrl برای حذف از انتخاب آزاد باشد
  try { map.dragRotate?.disable(); } catch {}
  try { map.touchPitch?.disable(); } catch {}
  try { map.touchZoomRotate?.disableRotation(); } catch {}
  map.on("load", () => {
    initDrawnSource();
    disableMapRotation();
    map.on("mousemove", onMouseMove);
    // پیش‌نمایش زنده انتخاب نقطه‌ای (حرکت موس بدون نگه‌داشتن دکمه)
    try { map.getCanvas().addEventListener("mousemove", onSelMouseMove); } catch {}
    // درگ با Shift/Ctrl/Alt = انتخاب؛ درگ ساده = پن نقشه
    try { map.getCanvas().addEventListener("mousedown", onSelMouseDown); } catch {}
    window.addEventListener("keydown", onSelKeyDown);
    window.addEventListener("keyup", onSelKeyUp);
    window.addEventListener("blur", onSelBlur);
    setSelectionToolActive(props.selectionTool);
    renderMarkers();
  });
});

onBeforeUnmount(() => {
  clearMarkers();
  clearLabelMarkers();
  clearSelAnchor();
  cancelSelDrag();
  try { window.removeEventListener("keydown", onSelKeyDown); } catch {}
  try { window.removeEventListener("keyup", onSelKeyUp); } catch {}
  try { window.removeEventListener("blur", onSelBlur); } catch {}
  try { map?.getCanvas()?.removeEventListener("mousemove", onSelMouseMove); } catch {}
  try { map?.getCanvas()?.removeEventListener("mousedown", onSelMouseDown); } catch {}
  if (map) map.remove();
});

watch(() => props.wells, () => scheduleRender());

// وقتی فقط highlight یا filter عوض شد، فقط data رو آپدیت کن (سریع‌تر از renderMarkers کامل)
function updateHighlightData() {
  if (!map) return;
  if (!wellsGeoJSON || !map.getSource("wells-src")) {
    if (!map.isStyleLoaded()) {
      map.once("idle", scheduleHighlight);
      return;
    }
    scheduleRender(true);
    return;
  }
  const highlightSet = new Set((props.highlightedIds || []).map(String));
  const psets = previewSets();
  const centerKey = wellKey(props.radiusCenter);
  const selectedKey = props.selectedId != null && props.selectedId !== '' ? String(props.selectedId) : null;
  const infoKey = props.infoWellKey != null && props.infoWellKey !== '' ? String(props.infoWellKey) : null;
  const fsetUp = filteredSet();
  const selSetUp = new Set((props.selectionIds || []).map(String));
  wellsGeoJSON.features.forEach((f) => {
    const key = wellKey(f);
    const neutral = isNeutralLayer(layerUuidOfFeature(f), fsetUp);
    const hl = neutral ? false : inHighlightSet(key, highlightSet);
    const { isSrc, isOk, isFail, isAny } = previewFlags(key, f.properties.id, psets);
    const isSelUp = selSetUp.size > 0 && (selSetUp.has(String(key)) || selSetUp.has(String(f.properties.id)));
    f.properties._highlighted = hl ? 1 : 0;
    f.properties._dimmed = (!neutral && props.hasFilter && !hl && !isAny && !isSelUp) ? 1 : 0;
    f.properties._match = (!neutral && props.hasFilter && hl) ? 1 : 0;
    f.properties._sel = isSelUp ? 1 : 0;
    f.properties._infoKey = (infoKey && (key === infoKey || String(f.properties.id) === infoKey)) ? 1 : 0;
    f.properties._psrc = isSrc && !isOk && !isFail ? 1 : 0;
    f.properties._pok = isOk ? 1 : 0;
    f.properties._pfail = isFail ? 1 : 0;
    f.properties._isCenter =
      centerKey && key === centerKey ? 1 : 0;
    // مجموعه انتخاب هم دقیقاً مسیر کلیک عادی (_selected زرد) را می‌گیرد تا حتماً دیده شود
    f.properties._selected =
      (((selectedKey && (key === selectedKey || String(f.properties.id) === selectedKey)) || isAny) || isSelUp) ? 1 : 0;
  });
  map.getSource("wells-src").setData(wellsGeoJSON);
}

watch(() => props.highlightedIds, scheduleHighlight);
watch(() => props.hasFilter, scheduleHighlight);
watch(() => props.filteredLayerUuids, scheduleHighlight);
watch(() => props.selectedId, scheduleHighlight);
// عارضه اطلاعات (آبی) با تغییر انتخاب از ابزار «اطلاعات» به‌روز می‌شود
watch(() => props.infoWellKey, scheduleHighlight);
function schedulePreviewRefresh() {
  // حالت نقطه‌ای (بدون wells-src) نیاز به رندر کامل مارکرها دارد
  if (!wellsGeoJSON || !map?.getSource?.("wells-src")) scheduleRender();
  else scheduleHighlight();
}
watch(() => props.previewIds, schedulePreviewRefresh);
watch(() => props.previewSourceIds, schedulePreviewRefresh);
watch(() => props.previewOkIds, schedulePreviewRefresh);
watch(() => props.previewFailIds, schedulePreviewRefresh);
// عارضه مرجع (قرمز) با تغییر انتخاب به‌روز می‌شود
watch(() => props.radiusCenter, scheduleHighlight);
// ابزار انتخاب: فعال/غیرفعال‌سازی تعامل‌های نقشه
// خروج از ابزار «اطلاعات» → بستن پاپ‌آپ و برگشت رنگ عارضه به حالت عادی
watch(() => props.selectionTool, (t, prev) => {
  if (prev === "info" && t !== "info") {
    try { lastInfoPopup?.remove?.(); } catch {}
    lastInfoPopup = null;
    emit("update:info-well-key", null);
  }
  setSelectionToolActive(t);
});
// تغییر مجموعه انتخاب → فقط استایل‌ها به‌روز شوند (هایلایت زرد)
// نکته: در حالت مارکری (لایه بدون هندسه) باید رندر کامل اجباری شود، چون
// scheduleRender عادی با wellsKey بدون‌تغییر هیچ کاری نمی‌کند و رنگ عوض نمی‌شد
watch(() => props.selectionIds, () => {
  if (!wellsGeoJSON || !map?.getSource?.("wells-src")) scheduleRender(true);
  else scheduleHighlight();
});

// ─── سیمبولوژی: به‌روزرسانی زنده ──────────────────────────
// تغییر رنگ/اندازه → فقط propertyها + setData (سریع)
// تغییر ساختاری (تعویض renderer / heatmap / dot) → بازسازی کامل
function symStructSig() {
  return Object.entries(props.symConfigs || {}).map(([k, c]) => `${k}:${c?.renderer}`).join('|')
}
let lastSymStruct = symStructSig()
function updateSymData() {
  if (!map) return
  if (!map.isStyleLoaded() && !map.getSource("wells-src")) {
    map.once("idle", onSymChange)
    return
  }
  if (!wellsGeoJSON || !map.getSource("wells-src")) {
    scheduleRender(true)
    return
  }
  const byKey = new Map()
  for (const w of props.wells) {
    const k = wellKey(w)
    if (k && !byKey.has(k)) byKey.set(k, w)
  }
  for (const f of wellsGeoJSON.features) {
    const key = wellKey(f)
    let w = byKey.get(key)
    if (!w && key && key.includes("::")) {
      const base = key.slice(key.indexOf("::") + 2)
      w = props.wells.find(x => String(x.id) === base)
    }
    delete f.properties._sym_color
    delete f.properties._sym_stroke
    delete f.properties._sym_strokew
    delete f.properties._sym_size
    delete f.properties._sym_fillop
    delete f.properties._sym_op
    delete f.properties._sym_shape
    delete f.properties._sym_dash
    const sym = w ? symStyleOf(w) : null
    if (sym) {
      f.properties._sym_color = sym.color
      f.properties._sym_stroke = sym.strokeColor
      f.properties._sym_strokew = sym.strokeWidth
      f.properties._sym_size = sym.size
      f.properties._sym_fillop = sym.fillOpacity
      f.properties._sym_op = sym.opacity
      f.properties._sym_shape = sym.shape ?? 'circle'
      f.properties._sym_dash = sym.dash ?? 'solid'
    }
  }
  try { map.getSource("wells-src").setData(wellsGeoJSON) } catch {}
  refreshSymLayers()
}
function onSymChange() {
  const sig = symStructSig()
  if (sig !== lastSymStruct) {
    lastSymStruct = sig
    scheduleRender(true)
  } else {
    updateSymData()
  }
}
watch(() => props.symConfigs, onSymChange, { deep: true })
watch(() => props.symVersion, () => scheduleRender(true))

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
  boundWellLayers.clear();
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

// زوم ملایم روی مجموعه‌ای از سطرهای نتیجه (مبنای دکمه‌های «اجرا/اعمال»)
function fitRowsToBounds(feats) {
  if (!map || !Array.isArray(feats) || !feats.length) return;
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
}

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
        map.flyTo({ center: g.coordinates, zoom: 10, duration: 800 });
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
        map.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 800 });
    } else if (well.lat && well.lng)
      map.flyTo({ center: [well.lng, well.lat], zoom: 10, duration: 800 });
  },
  zoomToLayer(uuid) {
    if (!map) return;
    const feats = props.wells.filter((w) => String(w._layerUuid) === String(uuid));
    fitRowsToBounds(feats);
  },
  zoomToResults(rows) {
    if (!map || !Array.isArray(rows) || !rows.length) return;
    fitRowsToBounds(rows);
  },
  enablePointPicker(callback) {
    if (!map) return;
    // بدون مخفی‌کردن لایه‌ها: اول بررسی می‌شود کلیک روی عارضه بوده یا فضای خالی
    picking = true;
    pickerCb = callback;
    map.getCanvas().style.cursor = "crosshair";
    if (map._pickerHandler) {
      map.off("click", map._pickerHandler);
      map._pickerHandler = null;
    }
    const handler = (e) => {
      if (!picking) return;
      let well = null;
      try {
        const layerIds = WELL_LAYER_IDS
          .filter((id) => map.getLayer(id));
        const feats = layerIds.length ? map.queryRenderedFeatures(e.point, { layers: layerIds }) : [];
        if (feats && feats.length) {
          const fp = feats[0].properties || {};
          const fpKey = wellKey({ properties: fp, id: fp.id });
          well = props.wells.find((w) => wellKey(w) === fpKey)
            ?? props.wells.find((w) => String(w.id) === String(fp.id));
        }
      } catch {}
      picking = false;
      map.getCanvas().style.cursor = "";
      map.off("click", handler);
      map._pickerHandler = null;
      if (well) {
        pickerCb = null;
        emit("select-well", well);
        return;
      }
      if (map._pickerMarker) map._pickerMarker.remove();
      const el = document.createElement("div");
      el.style.cssText =
        "width:36px;height:44px;overflow:visible;background:transparent;pointer-events:none;";
      const markerEl = document.createElement("div");
      markerEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="44"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#f97316" stroke="#fff" stroke-width="2"/><circle cx="12" cy="9" r="3.5" fill="#fff"/></svg>`;
      el.appendChild(markerEl);
      map._pickerMarker = new mapboxgl.Marker(el)
        .setLngLat(e.lngLat)
        .addTo(map);
      const cb = pickerCb;
      pickerCb = null;
      cb({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on("click", handler);
    map._pickerHandler = handler;
  },
  disablePointPicker() {
    picking = false;
    pickerCb = null;
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
  },
});
</script>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  background: var(--bg-panel);
}
.map-el {
  width: 100%;
  height: 100%;
  background: var(--bg-deep);
}

/* ─── نوار ابزارهای ثابت کنار نقشه (آیکونی، گروه‌بندی‌شده) ─── */
.map-tools {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 500;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 8px 6px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  max-height: calc(100% - 60px);
  overflow-y: auto;
}
.map-tools__group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.map-tools__sep {
  height: 1px;
  background: var(--border-subtle);
  margin: 2px 2px;
}
.map-tool {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
  padding: 0;
  position: relative;
}
.map-tool:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-subtle);
}
.map-tool.active {
  background: rgba(6, 182, 212, 0.12);
  border-color: #06b6d4;
  color: #0891b2;
  box-shadow: 0 0 0 1px #06b6d4;
}
/* آیکون «i» ابزار اطلاعات */
.map-tool[data-tool="info"] {
  font-weight: 800;
}
.map-tool:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.map-tool.danger:hover:not(:disabled) {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.map-tool--color {
  overflow: hidden;
}
.map-tool--color input[type="color"] {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
}
.map-tool__color-dot {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  display: block;
}
.map-tools__badge {
  background: #06b6d4;
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  font-family: var(--font-mono);
  text-align: center;
  line-height: 18px;
}

.tool-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px;
  width: 292px;
  max-width: calc(100vw - 24px);
  max-height: min(70vh, 560px);
  overflow-y: auto;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transform-origin: top right;
}
/* انیمیشن باز/بسته شدن پنل ابزارها */
.tool-panel-enter-active {
  transition: opacity 0.18s var(--ease-out), transform 0.26s var(--ease-smooth);
}
.tool-panel-leave-active {
  transition: opacity 0.14s var(--ease-out), transform 0.14s var(--ease-out);
}
.tool-panel-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
.tool-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
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
}
.tool-item.active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 600;
}
.tool-item.danger {
  color: var(--accent-danger);
}
.tool-item.danger:hover {
  background: var(--bg-panel-raised);
}
.tool-icon {
  font-size: 14px;
  width: 18px;
  text-align: center;
}

/* ─── دسته‌بندی پنل ابزار (بدون تب) ─── */
.tool-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tool-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary);
  padding: 2px 8px 0;
}
.tool-group-title__icon {
  color: #0891b2;
  font-size: 13px;
  line-height: 1;
}
.tool-divider--group {
  margin: 2px 4px;
  height: 1px;
  background: var(--border-subtle);
  opacity: 0.9;
}

/* ─── راهنمای سه‌مرحله‌ای تب انتخاب ─── */
.tool-steps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: rgba(240, 165, 0, 0.08);
  border: 1px solid rgba(240, 165, 0, 0.35);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.tool-steps__item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.7;
}
.tool-steps__item span {
  width: 19px;
  height: 19px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f0a500;
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  border-radius: 50%;
}

/* ─── کارت‌های ابزار انتخاب ─── */
.sel-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}
.sel-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 9px 2px 7px;
  background: var(--bg-panel-raised);
  border: 1.5px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
}
.sel-card:hover:not(.sel-card--active) {
  border-color: #06b6d4;
  color: #0891b2;
}
.sel-card--active {
  border-color: #06b6d4;
  color: #0891b2;
  background: rgba(6, 182, 212, 0.12);
  box-shadow: 0 0 0 1px #06b6d4;
}
.sel-card__icon {
  font-size: 17px;
  line-height: 1;
}
.sel-card__label {
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.sel-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.sel-mode {
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  font-weight: 600;
  padding: 7px 4px;
  cursor: pointer;
  text-align: center;
  white-space: nowrap;
}
.sel-mode:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.sel-mode.active {
  background: rgba(6, 182, 212, 0.14);
  border-color: #06b6d4;
  color: #0891b2;
  font-weight: 700;
}
.sel-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}
.sel-count {
  font-size: 12px;
  font-weight: 700;
  color: #0891b2;
  white-space: nowrap;
}
.sel-count--empty {
  color: var(--text-muted);
  font-weight: 600;
}
.sel-actions {
  display: flex;
  gap: 5px;
}
.sel-btn {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: 11px;
  font-family: inherit;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.sel-btn:hover:not(:disabled) {
  border-color: #06b6d4;
  color: #0891b2;
}
.sel-btn--danger:hover:not(:disabled) {
  border-color: var(--accent-danger);
  color: var(--accent-danger);
}
.sel-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tool-tip-box {
  background: rgba(6, 182, 212, 0.07);
  border: 1px solid rgba(6, 182, 212, 0.25);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tool-tip-box p {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-secondary);
  line-height: 1.7;
}
.tool-tip-box b {
  color: #0891b2;
}
.draw-grid {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tool-finish-btn {
  width: 100%;
  padding: 8px 14px;
  background: rgba(6, 182, 212, 0.12);
  border: 1px solid #06b6d4;
  border-radius: var(--radius-sm);
  color: #0891b2;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}
.tool-finish-btn:hover {
  background: rgba(6, 182, 212, 0.2);
}
/* نشان شمارش انتخاب روی دکمه ابزارها */
.tool-badge {
  background: #06b6d4;
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  padding: 0 7px;
  border-radius: 99px;
  font-family: var(--font-mono);
  line-height: 19px;
  min-width: 22px;
  text-align: center;
}
.tool-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #06b6d4;
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.25);
  flex-shrink: 0;
}
/* ─── نوار شناور ابزار فعال ─── */
.active-tool-chip {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 600;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: calc(100% - 220px);
  background: rgba(20, 30, 38, 0.92);
  border: 1px solid #06b6d4;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 99px;
  box-shadow: var(--shadow-md);
  pointer-events: auto;
  white-space: nowrap;
  overflow: hidden;
}
.active-tool-chip__pulse {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #06b6d4;
  flex-shrink: 0;
  animation: chip-pulse 1.4s ease-in-out infinite;
}
@keyframes chip-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(6, 182, 212, 0.6); }
  50% { box-shadow: 0 0 0 6px rgba(6, 182, 212, 0); }
}
.active-tool-chip__text {
  overflow: hidden;
  text-overflow: ellipsis;
}
.active-tool-chip__close {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  color: #fff;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.active-tool-chip__close:hover {
  background: var(--accent-danger);
}
.tool-chip-enter-active {
  transition: opacity 0.2s var(--ease-out), transform 0.25s var(--ease-smooth);
}
.tool-chip-leave-active {
  transition: opacity 0.15s var(--ease-out), transform 0.15s var(--ease-out);
}
.tool-chip-enter-from,
.tool-chip-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
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
  border-color: var(--brand);
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
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 10px;
  background: var(--bg-panel);
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
  padding: 4px 10px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: 11px;
  font-family: var(--font-mono);
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

<style>
/* مستطیل/دایره درگ انتخاب — سراسری چون به‌صورت داینامیک ساخته می‌شود */
.sel-drag-box {
  position: absolute;
  z-index: 600;
  border: 2px dashed #06b6d4;
  background: rgba(6, 182, 212, 0.12);
  pointer-events: none;
  border-radius: 2px;
}
.sel-drag-box.is-circle {
  border-radius: 50%;
}
</style>
