<template>
  <div class="app">
    <!-- نوار بالایی -->
    <header class="app-header">
      <div class="app-header__brand">
        <div class="brand-mark">🗺</div>
        <div>
          <h1>واکاوی لایه‌های مکانی</h1>
          <p>پرسش و استعلام از داده‌های توصیفی و مکانی ژئوباکس</p>
        </div>
      </div>

      <!-- انتخابگر لایه وکتور -->
      <div class="layer-selector">
        <!-- <label class="layer-selector__label">لایه وکتور</label> -->
        <div class="layer-selector__control">
          <select
            class="layer-select"
            :disabled="loadingLayers"
            @change="onLayerChange($event.target.value)"
          >
            <option value="">
              {{ loadingLayers ? "در حال بارگذاری…" : "یک لایه انتخاب کنید…" }}
            </option>
            <option
              v-for="layer in vectorLayers"
              :key="layer.uuid"
              :value="layer.uuid"
              :selected="selectedLayer?.uuid === layer.uuid"
            >
              {{ layer.display_name || layer.name }}
              ({{ layer.layer_type }} · {{ layer.feature_count }} عارضه)
            </option>
          </select>
          <span v-if="loadingLayers" class="spinner-inline"></span>
        </div>
        <div v-if="apiError" class="layer-error">{{ apiError }}</div>
      </div>

      <nav class="app-header__tabs">
        <button
          class="header-tab"
          :class="{ 'header-tab--active': queryKind === 'attribute' }"
          @click="queryKind = 'attribute'"
        >
          کوئری توصیفی
        </button>
        <button
          class="header-tab"
          :class="{ 'header-tab--active': queryKind === 'spatial' }"
          @click="queryKind = 'spatial'"
        >
          کوئری مکانی
        </button>
        <button
          class="header-tab"
          :class="{ 'header-tab--active': queryKind === 'stratigraphy' }"
          @click="queryKind = 'stratigraphy'"
        >
          چینه‌شناسی
        </button>
      </nav>

      <div class="app-header__map-switch">
        <button
          class="map-switch-btn"
          :class="{ 'map-switch-btn--active': mapProvider === 'leaflet' }"
          @click="mapProvider = 'leaflet'"
        >
          Leaflet
        </button>
        <button
          class="map-switch-btn"
          :class="{ 'map-switch-btn--active': mapProvider === 'mapbox' }"
          @click="mapProvider = 'mapbox'"
        >
          Mapbox
        </button>
      </div>
    </header>

    <!-- حالت بدون لایه انتخاب‌شده -->
    <div v-if="!selectedLayer && !loadingLayers" class="empty-state">
      <div class="empty-state__icon">🗺</div>
      <h2>لایه‌ای انتخاب نشده</h2>
      <p>یک لایه وکتور از منوی بالا انتخاب کنید تا داده‌ها بارگذاری شود.</p>
    </div>

    <!-- حالت بارگذاری لایه -->
    <div v-else-if="loadingFeatures || loadingFields" class="loading-state">
      <div class="spinner"></div>
      <p>{{ loadingFields ? "دریافت فیلدها…" : "دریافت عارضه‌ها…" }}</p>
    </div>

    <main v-else-if="queryKind !== 'stratigraphy'" class="app-main">
      <!-- پنل کناری -->
      <aside class="side-panel">
        <div class="side-panel__scroll">
          <QueryBuilder
            v-if="queryKind === 'attribute'"
            :conditions="conditions"
            :fields="queryableFields"
            :result-count="attributeResults.length"
            :total-count="allWells.length"
            @add="addCondition"
            @remove="removeCondition"
            @save="saveCurrentQuery"
          />

          <SpatialQueryPanel
            v-else
            v-model:mode="spatialMode"
            :wells="allWells"
            :radius-center="radiusCenter"
            v-model:radiusKm="radiusKm"
            :fields="spatialGroupFields"
            :custom-point="customPoint"
            :is-picking="isPickingPoint"
            @update:radiusCenter="radiusCenter = $event"
            @pick-point="onPickPoint"
            @clear-point="onClearPoint"
          />

          <div class="side-divider"></div>

          <SavedQueries
            :queries="savedQueries"
            @load="onLoadQuery"
            @delete="deleteSavedQuery"
          />
        </div>
      </aside>

      <!-- نقشه -->
      <section class="map-panel">
        <component
          :is="mapProvider === 'mapbox' ? MapboxMap : LeafletMap"
          ref="mapRef"
          :wells="allWells"
          :highlighted-ids="highlightedIds"
          :radius-center="
            queryKind === 'spatial' &&
            (spatialMode === 'radius' || spatialMode === 'point')
              ? radiusCenter
              : null
          "
          :radius-km="radiusKm"
          :neighbor-pairs="
            queryKind === 'spatial' && spatialMode === 'neighbor'
              ? neighborResults
              : []
          "
          @select-well="onSelectFromMap"
        />
      </section>

      <!-- جدول نتایج -->
      <section
        class="results-panel"
        :class="{ 'results-panel--collapsed': !resultsPanelOpen }"
      >
        <button class="results-toggle" @click="toggleResultsPanel">
          {{ resultsPanelOpen ? "◀" : "▶" }}
        </button>
        <div class="results-panel__content" v-show="resultsPanelOpen">
          <ResultsTable
            :rows="displayRows"
            :columns="displayColumns"
            :active-id="activeWellId"
            @select="onSelectFromTable"
            @hover="onHoverRow"
            @export="handleExport"
          />
        </div>
      </section>
    </main>
    <div v-else-if="queryKind === 'stratigraphy'" class="strat-page">
      <StratigraphyChart />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, onMounted } from "vue";
import LeafletMap from "./components/LeafletMap.vue";
import MapboxMap from "./components/MapboxMap.vue";
import QueryBuilder from "./components/QueryBuilder.vue";
import SpatialQueryPanel from "./components/SpatialQueryPanel.vue";
import ResultsTable from "./components/ResultsTable.vue";
import SavedQueries from "./components/SavedQueries.vue";
import StratigraphyChart from "./components/StratigraphyChart.vue";
import { useWellQuery } from "./composables/useWellQuery.js";
import { toGeoJSON, toCSV, downloadFile } from "./composables/useGeoUtils.js";
import JSZip from 'jszip'
import shpwrite from '@mapbox/shp-write'
import DxfWriter from 'dxf-writer'

const {
  vectorLayers,
  selectedLayer,
  queryableFields,
  loadingLayers,
  loadingFields,
  loadingFeatures,
  apiError,
  loadVectorLayers,
  selectLayer,
  allWells,
  conditions,
  attributeResults,
  addCondition,
  removeCondition,
  radiusCenter,
  radiusKm,
  radiusResults,
  neighborResults,
  savedQueries,
  saveCurrentQuery,
  loadSavedQuery,
  deleteSavedQuery,
} = useWellQuery();

const queryKind = ref("attribute");
const spatialMode = ref("radius");
const mapProvider = ref("mapbox");
const mapRef = shallowRef(null);
const activeWellId = ref(null);
const resultsPanelOpen = ref(true);
const customPoint = ref(null);
const isPickingPoint = ref(false);

function onPickPoint() {
  isPickingPoint.value = true;
  mapRef.value?.enablePointPicker((point) => {
    customPoint.value = point;
    isPickingPoint.value = false;
    radiusCenter.value = point;
  });
}

function onClearPoint() {
  customPoint.value = null;
  radiusCenter.value = null;
  isPickingPoint.value = false;
  mapRef.value?.disablePointPicker();
}

function toggleResultsPanel() {
  resultsPanelOpen.value = !resultsPanelOpen.value;
  setTimeout(() => {
    mapRef.value?.invalidateSize?.();
  }, 320);
}

// فیلدهای string برای گروه‌بندی همجواری
const spatialGroupFields = computed(() =>
  queryableFields.value
    .filter((f) => f.type === "string" || f.type === "enum")
    .map((f) => f.key),
);

onMounted(() => {
  loadVectorLayers();
});

function onLayerChange(uuid) {
  if (!uuid) return;
  const layer = vectorLayers.value.find((l) => l.uuid === uuid);
  if (layer) selectLayer(layer);
}

function onLoadQuery(q) {
  loadSavedQuery(q);
  queryKind.value = "attribute";
}

// ستون‌های جدول — داینامیک از فیلدهای API
const displayColumns = computed(() => {
  if (queryKind.value === "spatial") {
    if (spatialMode.value === "radius" || spatialMode.value === "point") {
      return [
        { key: "id", label: "شناسه", mono: true },
        ...queryableFields.value
          .slice(0, 4)
          .map((f) => ({ key: f.key, label: f.label })),
        { key: "distanceKm", label: "فاصله (km)", mono: true },
      ];
    }
    return [
      { key: "pairLabel", label: "جفت عارضه‌ها" },
      { key: "distanceKm", label: "فاصله (km)", mono: true },
    ];
  }
  return [
    { key: "id", label: "شناسه", mono: true },
    ...queryableFields.value
      .slice(0, 6)
      .map((f) => ({ key: f.key, label: f.label })),
  ];
});

const displayRows = computed(() => {
  if (queryKind.value === "attribute") return attributeResults.value;
  if (spatialMode.value === "radius" || spatialMode.value === "point")
    return radiusResults.value;
  return neighborResults.value.map((pair, i) => ({
    id: `pair-${i}`,
    pairLabel: `${pair.a.id}  ⇄  ${pair.b.id}`,
    distanceKm: pair.distanceKm,
  }));
});

const highlightedIds = computed(() => {
  if (queryKind.value === "attribute")
    return attributeResults.value.map((w) => w.id);
  if (spatialMode.value === "radius" || spatialMode.value === "point")
    return radiusResults.value.map((w) => w.id);
  const ids = new Set();
  neighborResults.value.forEach((p) => {
    ids.add(p.a.id);
    ids.add(p.b.id);
  });
  return [...ids];
});

function onSelectFromMap(well) {
  activeWellId.value = well.id;
  if (queryKind.value === "spatial" && spatialMode.value === "radius") {
    radiusCenter.value = well;
  }
  mapRef.value?.zoomToFeature(well.id);
}

function onSelectFromTable(row) {
  activeWellId.value = row.id;
  mapRef.value?.zoomToFeature(row.id);
}

function onHoverRow(row) {
  if (row.lat && row.lng) activeWellId.value = row.id;
}

function handleExport(format) {
  const rows = displayRows.value
  if (!rows.length) return
  const timestamp = new Date().toISOString().slice(0, 10)

  // تبدیل rows به GeoJSON features
  const toFeatures = () => rows
    .filter(r => r.lat && r.lng)
    .map(r => ({
      type: 'Feature',
      properties: { ...r },
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] }
    }))

  if (format === 'geojson') {
    const geo = toGeoJSON(rows.filter(r => r.lat && r.lng))
    downloadFile(JSON.stringify(geo, null, 2), `query-${timestamp}.geojson`, 'application/geo+json')

  } else if (format === 'csv') {
    const csv = toCSV(rows)
    downloadFile('\uFEFF' + csv, `query-${timestamp}.csv`, 'text/csv;charset=utf-8')

  } else if (format === 'kml') {
    const placemarks = toFeatures().map(f =>
      `<Placemark><name>${f.properties.id ?? ''}</name>
        <Point><coordinates>${f.geometry.coordinates[0]},${f.geometry.coordinates[1]},0</coordinates></Point>
      </Placemark>`
    ).join('\n')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`
    downloadFile(kml, `query-${timestamp}.kml`, 'application/vnd.google-earth.kml+xml')

  } else if (format === 'kmz') {
    const placemarks = toFeatures().map(f =>
      `<Placemark><name>${f.properties.id ?? ''}</name>
        <Point><coordinates>${f.geometry.coordinates[0]},${f.geometry.coordinates[1]},0</coordinates></Point>
      </Placemark>`
    ).join('\n')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`
    const zip = new JSZip()
    zip.file('doc.kml', kml)
    zip.generateAsync({ type: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `query-${timestamp}.kmz`; a.click()
      URL.revokeObjectURL(url)
    })

  } else if (format === 'shp') {
    const geojson = { type: 'FeatureCollection', features: toFeatures() }
    shpwrite.zip(geojson).then(blob => {
      const url = URL.createObjectURL(new Blob([blob]))
      const a = document.createElement('a')
      a.href = url; a.download = `query-${timestamp}.zip`; a.click()
      URL.revokeObjectURL(url)
    })

  } else if (format === 'dxf') {
    const d = new DxfWriter()
    d.setUnits('Meters')
    toFeatures().forEach(f => {
      const [x, y] = f.geometry.coordinates
      d.drawPoint(x, y)
    })
    downloadFile(d.toDxfString(), `query-${timestamp}.dxf`, 'application/dxf')
  }
}


</script>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
}

/* ---------- هدر ---------- */
.app-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.app-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: linear-gradient(155deg, var(--accent-depth), #2a6b60);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}
.app-header__brand h1 {
  margin: 0;
  font-size: 14.5px;
  font-weight: 800;
}
.app-header__brand p {
  margin: 1px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

/* ---------- انتخابگر لایه ---------- */
.layer-selector {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 280px;
}
.layer-selector__label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}
.layer-selector__control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.layer-select {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 12.5px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.layer-select:focus {
  outline: none;
  border-color: var(--accent-depth);
}
.layer-error {
  font-size: 11px;
  color: var(--accent-danger);
}

/* ---------- تب‌ها ---------- */
.app-header__tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.header-tab {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.header-tab:hover:not(.header-tab--active) {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}
.header-tab--active {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--border-strong);
}

.app-header__map-switch {
  margin-inline-start: auto;
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.map-switch-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11.5px;
  font-family: var(--font-mono);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  direction: ltr;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}
.map-switch-btn:hover:not(.map-switch-btn--active) {
  background: var(--bg-panel-raised);
  color: var(--text-secondary);
}
.map-switch-btn--active {
  background: var(--accent-depth);
  color: #fff;
  font-weight: 700;
}

/* ---------- empty / loading states ---------- */
.empty-state,
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
  text-align: center;
  padding: 32px;
}
.empty-state__icon {
  font-size: 48px;
  opacity: 0.4;
}
.empty-state h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-secondary);
}
.empty-state p {
  margin: 0;
  font-size: 13px;
  max-width: 360px;
  line-height: 1.8;
}

/* ---------- اسپینر ---------- */
.spinner,
.spinner-inline {
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent-depth);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner {
  width: 36px;
  height: 36px;
}
.spinner-inline {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- بدنه اصلی ---------- */
.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr auto;
  gap: 14px;
  padding: 14px;
  min-height: 0;
}

.side-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  min-height: 0;
  overflow: hidden;
}
.side-panel__scroll {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.side-divider {
  height: 1px;
  background: var(--border-subtle);
}

.results-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 14px;
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: width 0.3s ease;
  width: 300px;
}
.results-panel--collapsed {
  width: 32px;
  padding: 0;
}

.results-toggle {
  position: absolute;
  top: 50%;
  right: 0px;
  transform: translateY(-50%);
  width: 28px;
  height: 48px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
  cursor: pointer;
}
.results-toggle:hover {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}

.results-panel__content {
  height: 100%;
  overflow: hidden;
}

.map-panel {
  min-height: 0;
  border-radius: var(--radius-lg);
  position: relative;
  z-index: 0;
}

.strat-page {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 1180px) {
  .app-main {
    grid-template-columns: 280px 1fr;
    grid-template-rows: 1fr 300px;
  }
  .results-panel {
    grid-column: 1 / -1;
  }
}
</style>
